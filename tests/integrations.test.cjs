const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadAppConfig, describeConfig } = require('../electron/app-config.cjs');
const { createAccountService, createSessionStorage, passwordProblems } = require('../electron/account-service.cjs');
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

test('config: a development .env.local fills unset variables, and Supabase secret keys are refused', async t => {
  const dir = await tempDir(t);
  const envFile = path.join(dir, '.env.local');
  await fs.writeFile(envFile, '# local only\r\nCURSEFORGE_API_KEY="dev-file-key"\nSUPABASE_URL=https://xyz.supabase.co\nexport SUPABASE_PUBLISHABLE_KEY=sb_publishable_abc\n');
  const none = path.join(dir, 'none.json');
  const dev = await loadAppConfig({ userDataPath: dir, env: {}, publicConfigFile: none, devEnvFile: envFile });
  assert.equal(dev.curseforge.apiKey, 'dev-file-key');
  assert.equal(dev.supabase.url, 'https://xyz.supabase.co');
  assert.equal(dev.supabase.anonKey, 'sb_publishable_abc');
  const overridden = await loadAppConfig({ userDataPath: dir, env: { CURSEFORGE_API_KEY: 'real-env' }, publicConfigFile: none, devEnvFile: envFile });
  assert.equal(overridden.curseforge.apiKey, 'real-env', 'real environment variables win over .env.local');
  const packaged = await loadAppConfig({ userDataPath: dir, env: {}, publicConfigFile: none });
  assert.equal(packaged.curseforge.apiKey, '', 'without devEnvFile the file is never read');

  const serviceRole = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`;
  for (const key of ['sb_secret_123', serviceRole]) {
    const refused = await loadAppConfig({ userDataPath: dir, env: { SUPABASE_URL: 'https://xyz.supabase.co', SUPABASE_PUBLISHABLE_KEY: key }, publicConfigFile: none });
    assert.equal(refused.supabase.anonKey, '');
  }
});

// A stand-in for supabase-js that records calls. No network, no real project.
function fakeSupabase({ signUpSession = null, taken = [], identities = null, verifyError = null } = {}) {
  const calls = [];
  let session = null;
  const listeners = [];
  const profiles = new Map();
  const objects = new Map();
  const posts = [];
  const query = name => {
    const filters = [];
    let op = 'select';
    let values = null;
    const run = () => {
      calls.push([op, name, values, filters.slice()]);
      if (name === 'profiles' && op === 'update') {
        const id = filters.find(f => f[0] === 'id')[1];
        if (values.username && [...profiles.values()].some(p => p.id !== id && p.username === values.username)) return { error: { code: '23505' } };
        // Like the profiles trigger: one username change every 30 days.
        const before = profiles.get(id);
        const extra = {};
        if (values.username && values.username !== before.username) {
          const last = Date.parse(before.username_changed_at || '');
          if (last && last > Date.now() - 30 * 86400000) return { error: { code: 'SS030', hint: new Date(last + 30 * 86400000).toISOString() } };
          extra.username_changed_at = new Date().toISOString();
        }
        profiles.set(id, { ...before, ...values, ...extra });
        return { error: null };
      }
      if (name === 'inspiration_posts' && op === 'insert') {
        const row = { id: `p${posts.length + 1}`, created_at: new Date(Date.UTC(2026, 9, 1 + posts.length)).toISOString(), ...values };
        posts.push(row);
        return { data: { id: row.id }, error: null };
      }
      const rows = name === 'inspiration_posts' ? posts : name === 'profiles' ? [...profiles.values()] : [];
      const match = rows.filter(row => filters.every(([key, value, kind]) => (kind === 'in' ? value.includes(row[key]) : kind === 'lt' ? row[key] < value : row[key] === value)));
      if (op === 'delete') {
        for (const row of match) posts.splice(posts.indexOf(row), 1);
        return { error: null };
      }
      return { data: match.slice().reverse(), error: null, count: match.length };
    };
    const chain = {
      select: () => chain,
      insert: v => ((op = 'insert'), (values = v), chain),
      update: v => ((op = 'update'), (values = v), chain),
      delete: () => ((op = 'delete'), chain),
      eq: (k, v) => (filters.push([k, v]), chain),
      in: (k, v) => (filters.push([k, v, 'in']), chain),
      lt: (k, v) => (filters.push([k, v, 'lt']), chain),
      order: () => chain,
      limit: () => chain,
      single: () => Promise.resolve(run()),
      maybeSingle: () => Promise.resolve(run()).then(r => ({ ...r, data: Array.isArray(r.data) ? r.data[0] || null : r.data })),
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject)
    };
    return chain;
  };
  const bucket = name => ({
    upload: async (file, body, options) => (calls.push(['upload', name, file, options.contentType]), objects.set(`${name}/${file}`, body), { error: null }),
    remove: async files => (calls.push(['remove', name, files]), files.forEach(f => objects.delete(`${name}/${f}`)), { error: null }),
    list: async folder => ({ data: [...objects.keys()].filter(k => k.startsWith(`${name}/${folder}/`)).map(k => ({ name: k.split('/').pop() })), error: null }),
    getPublicUrl: file => ({ data: { publicUrl: `https://abc.supabase.co/storage/v1/object/public/${name}/${file}` } }),
    createSignedUrls: async files => ({ data: files.map(file => ({ path: file, signedUrl: `https://abc.supabase.co/signed/${file}` })), error: null })
  });
  const client = {
    auth: {
      onAuthStateChange: fn => listeners.push(fn),
      getSession: async () => ({ data: { session } }),
      signUp: async args => (calls.push(['signUp', args]), { data: { session: signUpSession, user: { id: 'new', identities: identities ?? [{}] } }, error: null }),
      signInWithPassword: async ({ email, password }) => {
        calls.push(['signIn', email]);
        if (password !== 'correct horse 1') return { data: {}, error: { code: 'invalid_credentials', status: 400 } };
        session = { access_token: 'user-token', user: { id: '00000000-0000-0000-0000-00000000000a', email, email_confirmed_at: 'x', user_metadata: { username: 'ana' } } };
        return { data: { user: session.user, session }, error: null };
      },
      signOut: async () => ((session = null), { error: null }),
      verifyOtp: async args => (calls.push(['verifyOtp', args]), { data: { user: null }, error: verifyError }),
      resend: async args => (calls.push(['resend', args]), { error: null }),
      updateUser: async args => (calls.push(['updateUser', Object.keys(args)]), { error: null }),
      resetPasswordForEmail: async email => (calls.push(['reset', email]), { error: null })
    },
    rpc: async (fn, args) => {
      calls.push(['rpc', fn, args]);
      if (fn === 'username_available') return { data: !taken.includes(args.name), error: null };
      if (fn === 'ensure_my_profile') {
        const id = session.user.id;
        if (!profiles.has(id)) profiles.set(id, { id, username: session.user.user_metadata.username, avatar_url: null });
        return { data: [profiles.get(id)], error: null };
      }
      return { data: null, error: { code: 'PGRST202' } };
    },
    from: query,
    storage: { from: bucket }
  };
  return { client, calls, profiles, objects, posts };
}

function accountWith(t, dir, fake, supabase = { url: 'https://abc.supabase.co', anonKey: 'sb_publishable_x' }) {
  return createAccountService({ getConfig: async () => ({ supabase }), userDataPath: () => dir, safeStorage: null, createClient: () => fake.client });
}
const webp = n => ({ data: new Uint8Array(n).fill(1), type: 'image/webp' });

test('accounts: not configured is reported, not faked', async t => {
  const dir = await tempDir(t);
  const service = accountWith(t, dir, fakeSupabase(), { url: '', anonKey: '' });
  assert.deepEqual(await service.status(), { configured: false, user: null, persistent: false, pendingEmail: '' });
  await assert.rejects(service.signIn({ email: 'a@b.co', password: 'x' }), { code: 'ACCOUNT_NOT_CONFIGURED' });
});

test('accounts: sign-up checks email, password rules and username before contacting the service', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase({ taken: ['ana'] });
  const service = accountWith(t, dir, fake);
  assert.deepEqual(passwordProblems('abcdefgh'), { length: true, letter: true, number: false });
  await assert.rejects(service.signUp({ email: 'not-an-email', password: 'long enough 1', username: 'bea' }), { code: 'ACCOUNT_EMAIL_INVALID' });
  await assert.rejects(service.signUp({ email: 'b@example.com', password: 'onlyletters', username: 'bea' }), { code: 'ACCOUNT_WEAK_PASSWORD' });
  await assert.rejects(service.signUp({ email: 'b@example.com', password: '12345678', username: 'bea' }), { code: 'ACCOUNT_WEAK_PASSWORD' });
  await assert.rejects(service.signUp({ email: 'b@example.com', password: 'long enough 1', username: 'no spaces' }), { code: 'ACCOUNT_USERNAME_INVALID' });
  assert.equal(fake.calls.length, 0);
  assert.deepEqual(await service.checkUsername({ username: 'x' }), { valid: false, available: false });
  assert.deepEqual(await service.checkUsername({ username: 'Ana' }), { valid: true, available: false });
  await assert.rejects(service.signUp({ email: 'b@example.com', password: 'long enough 1', username: 'ana' }), { code: 'ACCOUNT_USERNAME_TAKEN' });
  const result = await service.signUp({ email: 'B@example.com', password: 'long enough 1', username: 'Bea_Sims' });
  assert.equal(result.needsConfirmation, true);
  assert.deepEqual(fake.calls.find(c => c[0] === 'signUp')[1].options.data, { username: 'bea_sims' });
  assert.equal((await service.status()).pendingEmail, 'b@example.com');
  await service.resendConfirmation({});
  assert.deepEqual(fake.calls.at(-1), ['resend', { type: 'signup', email: 'b@example.com' }]);
  await service.verifyEmail({ code: '123 456' });
  assert.deepEqual(fake.calls.find(c => c[0] === 'verifyOtp')[1], { email: 'b@example.com', token: '123456', type: 'email' });
  await assert.rejects(accountWith(t, dir, fakeSupabase({ identities: [] })).signUp({ email: 'c@example.com', password: 'long enough 1', username: 'cee' }), { code: 'ACCOUNT_EXISTS' });
});

test('accounts: an email confirmed through its link signs in instead of resending or failing the code', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await service.signUp({ email: 'ana@example.com', password: 'correct horse 1', username: 'ana' });
  const resent = await service.resendConfirmation({});
  assert.equal(resent.alreadyConfirmed, true);
  assert.equal(resent.user.username, 'ana');
  assert.ok(!fake.calls.some(c => c[0] === 'resend'));
  assert.equal((await service.status()).pendingEmail, '');

  const expired = fakeSupabase({ verifyError: { code: 'otp_expired', status: 403 } });
  const second = accountWith(t, await tempDir(t), expired);
  await second.signUp({ email: 'ana@example.com', password: 'correct horse 1', username: 'ana' });
  const verified = await second.verifyEmail({ code: '123456' });
  assert.equal(verified.alreadyConfirmed, true);
  // A wrong code for an address that is not confirmed yet still fails.
  const third = accountWith(t, await tempDir(t), fakeSupabase({ verifyError: { code: 'otp_expired', status: 403 } }));
  await third.signUp({ email: 'bea@example.com', password: 'long enough 1', username: 'bea' });
  await assert.rejects(third.verifyEmail({ code: '123456' }));
});

test('accounts: sign-in loads (or recovers) the profile; reset uses a code then sets the new password', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await assert.rejects(service.signIn({ email: 'ana@example.com', password: 'wrong' }), { code: 'ACCOUNT_INVALID_CREDENTIALS' });
  const signedIn = await service.signIn({ email: ' Ana@Example.com ', password: 'correct horse 1' });
  assert.equal(signedIn.user.email, 'ana@example.com');
  assert.equal(signedIn.user.username, 'ana');
  assert.equal(signedIn.user.profileMissing, false);
  assert.ok(fake.calls.some(c => c[0] === 'rpc' && c[1] === 'ensure_my_profile'));
  await assert.rejects(service.completePasswordReset({ email: 'ana@example.com', code: 'abc', password: 'new password 2' }), { code: 'ACCOUNT_CODE_INVALID' });
  await service.requestPasswordReset({ email: 'ana@example.com' });
  await service.completePasswordReset({ email: 'ana@example.com', code: '654321', password: 'new password 2' });
  assert.ok(fake.calls.some(c => c[0] === 'updateUser' && c[1][0] === 'password'));
});

test('accounts: profile changes, avatars in the user folder, and a taken username is explained', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await assert.rejects(service.uploadAvatar(webp(10)), { code: 'ACCOUNT_SIGNED_OUT' });
  await service.signIn({ email: 'ana@example.com', password: 'correct horse 1' });
  fake.profiles.set('other', { id: 'other', username: 'taken' });
  await assert.rejects(service.updateProfile({ username: 'Ana.B' }), { code: 'ACCOUNT_PASSWORD_REQUIRED' });
  await assert.rejects(service.updateProfile({ username: 'Ana.B', password: 'wrong' }), { code: 'ACCOUNT_WRONG_PASSWORD' });
  await assert.rejects(service.updateProfile({ username: 'ana', password: 'correct horse 1' }), { code: 'ACCOUNT_USERNAME_SAME' });
  await assert.rejects(service.updateProfile({ username: 'taken', password: 'correct horse 1' }), { code: 'ACCOUNT_USERNAME_TAKEN' });
  const renamed = (await service.updateProfile({ username: 'Ana.B', password: 'correct horse 1' })).user;
  assert.equal(renamed.username, 'ana.b');
  assert.ok(Date.parse(renamed.usernameChangeAvailableAt) > Date.now() + 29 * 86400000, 'the next change is 30 days away');
  await assert.rejects(service.updateProfile({ username: 'ana.c', password: 'correct horse 1' }), { code: 'ACCOUNT_USERNAME_TOO_SOON' });
  // After 30 days another change is allowed.
  fake.profiles.get('00000000-0000-0000-0000-00000000000a').username_changed_at = new Date(Date.now() - 31 * 86400000).toISOString();
  assert.equal((await service.updateProfile({ username: 'ana.c', password: 'correct horse 1' })).user.usernameChangeAvailableAt !== null, true);
  await assert.rejects(service.uploadAvatar({ data: new Uint8Array(4), type: 'image/svg+xml' }), { code: 'IMAGE_TYPE' });
  await assert.rejects(service.uploadAvatar(webp(2 * 1024 * 1024 + 1)), { code: 'IMAGE_TOO_LARGE' });
  await service.uploadAvatar(webp(10));
  const second = await service.uploadAvatar(webp(12));
  const files = [...fake.objects.keys()];
  assert.equal(files.length, 1, 'the previous avatar is removed');
  assert.match(files[0], /^avatars\/00000000-0000-0000-0000-00000000000a\/avatar-\d+\.webp$/);
  assert.match(second.user.avatarUrl, /^https:\/\/abc\.supabase\.co\/storage\/v1\/object\/public\/avatars\/00000000-0000-0000-0000-00000000000a\//);
  await service.removeAvatar();
  assert.equal(fake.objects.size, 0);
});

test('inspiration: posts upload into the author folder, list with authors and signed links, and delete their image', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await assert.rejects(service.listPosts(), { code: 'ACCOUNT_SIGNED_OUT' });
  await service.signIn({ email: 'ana@example.com', password: 'correct horse 1' });
  await assert.rejects(service.createPost({ data: new Uint8Array(10 * 1024 * 1024 + 1), type: 'image/png' }), { code: 'IMAGE_TOO_LARGE' });
  const { id } = await service.createPost({ data: new Uint8Array(8), type: 'image/gif', caption: '  Cozy\r\nroom ', category: 'build' });
  await service.createPost({ ...webp(8), category: 'not-a-category' });
  const [path1] = [...fake.objects.keys()];
  assert.match(path1, /^inspiration\/00000000-0000-0000-0000-00000000000a\/[0-9a-f-]{36}\.gif$/);
  assert.deepEqual(fake.posts.map(p => [p.caption, p.category]), [['Cozy\nroom', 'build'], ['', 'other']]);
  const page = await service.listPosts({ limit: 1 });
  assert.equal(page.posts.length, 1);
  assert.ok(page.nextBefore, 'there is a next page');
  assert.equal(page.posts[0].author.username, 'ana');
  assert.equal(page.posts[0].own, true);
  assert.match(page.posts[0].imageUrl, /^https:\/\/abc\.supabase\.co\/signed\//);
  const filtered = await service.listPosts({ category: 'build' });
  assert.deepEqual(filtered.posts.map(p => p.id), [id]);
  const profile = await service.getProfile({ userId: '00000000-0000-0000-0000-00000000000a' });
  assert.equal(profile.postCount, 2);
  assert.deepEqual(await service.deletePost({ id }), { deleted: true, imageRemoved: true });
  assert.ok(![...fake.objects.keys()].includes(path1), 'the image is deleted with the post');
  await assert.rejects(service.deletePost({ id: 'p999' }), { code: 'ACCOUNT_FORBIDDEN' });
});

test('feedback: only known categories, a message is required, and the sender is the signed-in user', async t => {
  const dir = await tempDir(t);
  const fake = fakeSupabase();
  const service = accountWith(t, dir, fake);
  await service.signIn({ email: 'ana@example.com', password: 'correct horse 1' });
  await assert.rejects(service.sendFeedback({ category: 'bug_report', message: '   ' }), { code: 'INVALID_INPUT' });
  await assert.rejects(service.sendFeedback({ category: 'bug_report', message: 'x', email: 'nope' }), { code: 'ACCOUNT_EMAIL_INVALID' });
  await service.sendFeedback({ category: 'rant', message: 'Hello', email: '' });
  const insert = fake.calls.find(c => c[0] === 'insert' && c[1] === 'feedback');
  assert.deepEqual(insert[2], { user_id: '00000000-0000-0000-0000-00000000000a', category: 'other', message: 'Hello', email: null });
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

test('a session saved by another copy or version of the app is not reused', async t => {
  const dir = await tempDir(t);
  const fakeCrypto = { isEncryptionAvailable: () => true, encryptString: s => Buffer.from(s), decryptString: b => b.toString() };
  const old = createSessionStorage({ userDataPath: () => dir, safeStorage: fakeCrypto, installId: 'copy-a' });
  await old.adapter.setItem('k', 'session');
  assert.equal(await createSessionStorage({ userDataPath: () => dir, safeStorage: fakeCrypto, installId: 'copy-a' }).adapter.getItem('k'), 'session');
  const other = createSessionStorage({ userDataPath: () => dir, safeStorage: fakeCrypto, installId: 'copy-b' });
  assert.equal(await other.adapter.getItem('k'), null);
  assert.deepEqual(await fs.readdir(dir), [], 'the old session file is deleted');
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
