const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadAppConfig, describeConfig } = require('../electron/app-config.cjs');
const { createAccountService, createSessionStorage, cleanCollections } = require('../electron/account-service.cjs');
const { createGameLauncher } = require('../electron/game-launcher.cjs');

async function tempDir(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'simmerspace-int-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('config: environment beats the local file, placeholders count as empty, and secrets are never described', async t => {
  const dir = await tempDir(t);
  const publicFile = path.join(dir, 'public-config.json');
  await fs.writeFile(publicFile, JSON.stringify({ curseforge: { apiKey: 'bundled-key-must-be-ignored' }, supabase: { url: 'https://abc.supabase.co', anonKey: 'public-anon' } }));
  await fs.writeFile(path.join(dir, 'simmerspace.config.json'), JSON.stringify({ curseforge: { apiKey: 'file-key' } }));

  const fromFile = await loadAppConfig({ userDataPath: dir, env: {}, publicConfigFile: publicFile });
  assert.equal(fromFile.curseforge.apiKey, 'file-key');
  assert.equal(fromFile.curseforge.keySource, 'file');
  assert.equal(fromFile.curseforge.ignoredBundledKey, true);
  assert.equal(fromFile.supabase.url, 'https://abc.supabase.co');

  const fromEnv = await loadAppConfig({ userDataPath: dir, env: { CURSEFORGE_API_KEY: 'env-key', SUPABASE_URL: 'http://evil.example' }, publicConfigFile: publicFile });
  assert.equal(fromEnv.curseforge.apiKey, 'env-key');
  assert.equal(fromEnv.supabase.url, 'https://abc.supabase.co', 'plain http outside this computer is refused');

  const placeholder = await loadAppConfig({ userDataPath: dir, env: { CURSEFORGE_API_KEY: 'your-curseforge-api-key' }, publicConfigFile: path.join(dir, 'missing.json') });
  assert.equal(placeholder.curseforge.apiKey, 'file-key');

  const described = JSON.stringify(describeConfig(fromEnv));
  assert.ok(!described.includes('env-key') && !described.includes('file-key') && !described.includes('public-anon'));
  assert.equal(describeConfig(fromEnv).curseforge.keyLength, 7);
});

test('config: a broken or missing file means "not set up", not a crash', async t => {
  const dir = await tempDir(t);
  await fs.writeFile(path.join(dir, 'simmerspace.config.json'), '{not json');
  const config = await loadAppConfig({ userDataPath: dir, env: {}, publicConfigFile: path.join(dir, 'none.json') });
  assert.equal(config.curseforge.apiKey, '');
  assert.equal(describeConfig(config).curseforge.configured, false);
  assert.equal(describeConfig(config).supabase.configured, false);
});

// A stand-in for supabase-js that records calls. No network, no real project.
function fakeSupabase({ signUpSession = null } = {}) {
  const calls = [];
  let session = null;
  const listeners = [];
  const table = name => {
    const chain = {
      _name: name,
      select: () => chain,
      eq: () => chain,
      order: () => Promise.resolve({ data: [], error: null }),
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
      update: values => (calls.push(['update', name, values]), chain),
      upsert: (values, options) => (calls.push(['upsert', name, values, options]), Promise.resolve({ error: null })),
      then: (resolve, reject) => Promise.resolve({ error: null }).then(resolve, reject)
    };
    return chain;
  };
  const client = {
    auth: {
      onAuthStateChange: fn => listeners.push(fn),
      getSession: async () => ({ data: { session } }),
      signUp: async args => (calls.push(['signUp', args]), { data: { session: signUpSession }, error: null }),
      signInWithPassword: async ({ email, password }) => {
        calls.push(['signIn', email]);
        if (password !== 'correct horse') return { data: {}, error: { code: 'invalid_credentials', status: 400 } };
        session = { access_token: 'user-token', user: { id: 'u1', email, email_confirmed_at: 'x', user_metadata: { display_name: 'Ana' } } };
        return { data: { user: session.user, session }, error: null };
      },
      signOut: async () => ((session = null), { error: null }),
      verifyOtp: async args => (calls.push(['verifyOtp', args]), { data: { user: { id: 'u1', email: args.email } }, error: null }),
      updateUser: async args => (calls.push(['updateUser', Object.keys(args)]), { error: null }),
      resetPasswordForEmail: async email => (calls.push(['reset', email]), { error: null })
    },
    from: table
  };
  return { client, calls };
}

function accountWith(t, dir, fake, supabase = { url: 'https://abc.supabase.co', anonKey: 'anon' }) {
  return createAccountService({ getConfig: async () => ({ supabase }), userDataPath: () => dir, safeStorage: null, createClient: () => fake.client });
}

test('accounts: not configured is reported, not faked', async t => {
  const dir = await tempDir(t);
  const service = accountWith(t, dir, fakeSupabase(), { url: '', anonKey: '' });
  assert.deepEqual(await service.status(), { configured: false, user: null, persistent: false, pendingEmail: '' });
  await assert.rejects(service.signIn({ email: 'a@b.co', password: 'x' }), { code: 'ACCOUNT_NOT_CONFIGURED' });
});

test('accounts: validates input before contacting the service and maps provider errors', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await assert.rejects(service.signUp({ email: 'not-an-email', password: 'long enough' }), { code: 'ACCOUNT_EMAIL_INVALID' });
  await assert.rejects(service.signUp({ email: 'ana@example.com', password: 'short' }), { code: 'ACCOUNT_WEAK_PASSWORD' });
  assert.equal(fake.calls.length, 0);
  await assert.rejects(service.signIn({ email: 'ana@example.com', password: 'wrong' }), { code: 'ACCOUNT_INVALID_CREDENTIALS' });
  const signedIn = await service.signIn({ email: ' Ana@Example.com ', password: 'correct horse' });
  assert.equal(signedIn.user.email, 'ana@example.com');
  assert.equal(signedIn.user.displayName, 'Ana');
  assert.equal((await service.status()).user.id, 'u1');
});

test('accounts: sign-up waits for the emailed code; password reset uses a code then sets the new password', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  const result = await service.signUp({ email: 'ana@example.com', password: 'long enough', name: 'Ana' });
  assert.equal(result.needsConfirmation, true);
  assert.equal((await service.status()).pendingEmail, 'ana@example.com');
  await service.verifyEmail({ code: '123 456' });
  assert.deepEqual(fake.calls.find(call => call[0] === 'verifyOtp')[1], { email: 'ana@example.com', token: '123456', type: 'email' });
  await assert.rejects(service.completePasswordReset({ email: 'ana@example.com', code: 'abc', password: 'new password' }), { code: 'ACCOUNT_CODE_INVALID' });
  await service.requestPasswordReset({ email: 'ana@example.com' });
  await service.completePasswordReset({ email: 'ana@example.com', code: '654321', password: 'new password' });
  assert.deepEqual(fake.calls.at(-1), ['updateUser', ['password']]);
});

test('accounts: sync sends only cleaned data for the signed-in user', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await assert.rejects(service.pushData({}), { code: 'ACCOUNT_SIGNED_OUT' });
  await service.signIn({ email: 'ana@example.com', password: 'correct horse' });
  await service.pushData({ preferences: { mode: 'dark' }, favorites: ['a', 5], collections: [{ id: 'c1', name: ' Cozy ', color: 'red', items: ['x', {}], updated: 5 }, { id: 9 }] });
  const settings = fake.calls.find(call => call[0] === 'upsert' && call[1] === 'user_settings');
  assert.equal(settings[2].user_id, 'u1');
  assert.deepEqual(settings[2].favorites, ['a']);
  const collections = fake.calls.find(call => call[0] === 'upsert' && call[1] === 'collections');
  assert.equal(collections[2].length, 1);
  assert.equal(collections[2][0].user_id, 'u1');
  assert.equal(collections[2][0].color, null, 'invalid colors are not uploaded');
  assert.deepEqual(collections[3], { onConflict: 'user_id,client_id' });
  assert.equal(cleanCollections([{ id: 'x', name: 'n', color: '#AABBCC', items: [] }])[0].color, '#aabbcc');
});

test('session storage keeps sessions in memory only when the system cannot encrypt them', async t => {
  const dir = await tempDir(t);
  const plain = createSessionStorage({ userDataPath: () => dir, safeStorage: { isEncryptionAvailable: () => false } });
  await plain.adapter.setItem('k', 'secret-session');
  assert.equal(await plain.adapter.getItem('k'), 'secret-session');
  assert.deepEqual(await fs.readdir(dir), [], 'nothing is written unencrypted');

  const fakeCrypto = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from([...Buffer.from(s)].reverse()), decryptString: b => Buffer.from([...b].reverse()).toString() };
  const sealed = createSessionStorage({ userDataPath: () => dir, safeStorage: fakeCrypto });
  await sealed.adapter.setItem('k', 'secret-session');
  const raw = await fs.readFile(path.join(dir, 'account-session.json'), 'utf8');
  assert.ok(!raw.includes('secret-session'));
  const again = createSessionStorage({ userDataPath: () => dir, safeStorage: fakeCrypto });
  assert.equal(await again.adapter.getItem('k'), 'secret-session');
  await again.adapter.removeItem('k');
  assert.deepEqual(await fs.readdir(dir), []);
});

test('Launch Game starts TS4_x64.exe from the chosen game folder and explains what is missing', async t => {
  const dir = await tempDir(t);
  const opened = [];
  const launcher = folder => createGameLauncher({ getGameFolder: async () => folder, openPath: async file => (opened.push(file), '') });
  await assert.rejects(launcher(undefined).launch(), { code: 'GAME_FOLDER_NOT_SET' });
  await assert.rejects(launcher(dir).launch(), { code: 'GAME_NOT_FOUND' });
  await fs.mkdir(path.join(dir, 'Game', 'Bin'), { recursive: true });
  await fs.writeFile(path.join(dir, 'Game', 'Bin', 'TS4_x64.exe'), '');
  const game = launcher(dir);
  assert.deepEqual(await game.launch(), { launched: true });
  assert.deepEqual(await game.launch(), { launched: true, repeated: true }, 'a double click does not start two copies');
  assert.deepEqual(opened, [path.join(dir, 'Game', 'Bin', 'TS4_x64.exe')]);
  const failing = createGameLauncher({ getGameFolder: async () => dir, openPath: async () => 'Access denied' });
  await assert.rejects(failing.launch(), { code: 'GAME_LAUNCH_FAILED' });
});
