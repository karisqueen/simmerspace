const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createUpdater, classifyUpdateError } = require('../electron/updater.cjs');

// A stand-in for electron-updater's autoUpdater: no network, it only emits the events a real check would.
function fakeAutoUpdater({ latest = '0.12.1', failDownload = false } = {}) {
  const u = new EventEmitter();
  u.calls = [];
  u.checkForUpdates = async () => {
    u.calls.push('check');
    u.emit('checking-for-update');
    if (latest) u.emit('update-available', { version: latest });
    else u.emit('update-not-available', {});
  };
  u.downloadUpdate = async () => {
    u.calls.push('download');
    if (failDownload) throw new Error('net::ERR_FAILED https://example.invalid/C:/Users/x');
    u.emit('download-progress', { percent: 41.6 });
    u.emit('update-downloaded', { version: latest });
  };
  u.quitAndInstall = (silent, runAfter) => u.calls.push(['install', silent, runAfter]);
  return u;
}

test('updates: portable and source copies never try to update themselves', async () => {
  let loaded = false;
  const updater = createUpdater({ supported: false, currentVersion: '0.12.0', loadUpdater: () => ((loaded = true), fakeAutoUpdater()) });
  assert.equal(updater.state().status, 'unsupported');
  await assert.rejects(updater.check(), { code: 'UPDATE_UNSUPPORTED' });
  assert.equal(loaded, false);
});

test('updates: nothing downloads or installs until the page asks for each step', async () => {
  const fake = fakeAutoUpdater();
  const sent = [];
  const updater = createUpdater({ supported: true, currentVersion: '0.12.0', send: s => sent.push(s.status), loadUpdater: () => fake });
  await assert.rejects(async () => updater.install(), { code: 'UPDATE_NOT_READY' });
  const checked = await updater.check();
  assert.equal(fake.autoDownload, false);
  assert.equal(fake.autoInstallOnAppQuit, false);
  assert.deepEqual(fake.calls, ['check']);
  assert.equal(checked.status, 'available');
  assert.equal(checked.version, '0.12.1');
  const downloaded = await updater.download();
  assert.equal(downloaded.status, 'ready');
  assert.deepEqual(sent, ['checking', 'available', 'downloading', 'downloading', 'ready']);
  updater.install();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fake.calls.at(-1), ['install', true, true]);
});

test('updates: up to date and failures are reported without the updater’s own message', async () => {
  const current = createUpdater({ supported: true, currentVersion: '0.12.0', loadUpdater: () => fakeAutoUpdater({ latest: '' }) });
  assert.equal((await current.check()).status, 'current');
  await assert.rejects(current.download(), { code: 'UPDATE_NOT_AVAILABLE' });

  const failing = createUpdater({ supported: true, currentVersion: '0.12.0', loadUpdater: () => fakeAutoUpdater({ failDownload: true }) });
  await failing.check();
  const failed = await failing.download();
  assert.equal(failed.status, 'error');
  assert.equal(failed.error, 'UPDATE_FAILED');
  assert.doesNotMatch(JSON.stringify(failed), /example|Users/);
  assert.equal(failed.version, '0.12.1', 'the download can be tried again');
});

test('updates: failures say what kind of problem it was, so the page can explain it', async () => {
  assert.equal(classifyUpdateError(new Error('getaddrinfo ENOTFOUND github.com'), 'check'), 'offline');
  assert.equal(classifyUpdateError(new Error('net::ERR_INTERNET_DISCONNECTED'), 'download'), 'offline');
  // Only a pre-release (or no release) on GitHub: what 0.12.0 and older copies hit with the "beta" tag.
  assert.equal(classifyUpdateError(new Error('Unable to find latest version on GitHub (https://github.com/x/y/releases/latest), please ensure a production release exists: HttpError: 404'), 'check'), 'no-release');
  assert.equal(classifyUpdateError(new Error('Cannot find latest.yml in the latest release artifacts'), 'check'), 'no-release');
  assert.equal(classifyUpdateError(new Error('sha512 checksum mismatch, expected abc'), 'download'), 'verify');
  assert.equal(classifyUpdateError(new Error('EPERM: operation not permitted'), 'download'), 'download');
  assert.equal(classifyUpdateError(new Error('something odd'), 'check'), 'unknown');

  const fake = fakeAutoUpdater();
  fake.checkForUpdates = async () => {
    throw new Error('Unable to find latest version on GitHub: HttpError: 404 https://github.com/C:/Users/x');
  };
  const updater = createUpdater({ supported: true, currentVersion: '0.12.1', loadUpdater: () => fake });
  const failed = await updater.check();
  assert.equal(failed.status, 'error');
  assert.equal(failed.errorKind, 'no-release');
  assert.doesNotMatch(JSON.stringify(failed), /github|Users/);
});
