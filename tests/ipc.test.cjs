const test = require('node:test');
const assert = require('node:assert/strict');
const { createIpc, validators } = require('../electron/ipc.cjs');
const { AppError } = require('../electron/errors.cjs');

function fakeIpcMain() {
  const handlers = new Map();
  const listeners = new Map();
  return {
    handlers,
    listeners,
    handle: (channel, fn) => handlers.set(channel, fn),
    on: (channel, fn) => listeners.set(channel, fn)
  };
}
const fromApp = { senderFrame: { url: 'file:///app/renderer/index.html' } };
const fromElsewhere = { senderFrame: { url: 'https://example.com/' } };

test('handlers answer only the app page and wrap results and errors', async () => {
  const ipcMain = fakeIpcMain();
  const ipc = createIpc({ ipcMain, isTrustedSender: url => url === 'file:///app/renderer/index.html' });
  ipc.handle('ok', validators.string, value => value.toUpperCase());
  ipc.handle('fails', validators.none, () => {
    throw new AppError('NAME_CONFLICT', 'Exists.');
  });
  ipc.handle('fs', validators.none, () => {
    throw Object.assign(new Error("EACCES: permission denied, open 'C:\\Users\\someone\\secret'"), { code: 'EACCES' });
  });
  assert.deepEqual(await ipcMain.handlers.get('ok')(fromApp, 'hi'), { ok: true, value: 'HI' });
  assert.equal((await ipcMain.handlers.get('ok')(fromElsewhere, 'hi')).error.code, 'FORBIDDEN');
  assert.equal((await ipcMain.handlers.get('ok')(fromApp, 42)).error.code, 'INVALID_INPUT');
  assert.deepEqual(await ipcMain.handlers.get('fails')(fromApp), { ok: false, error: { code: 'NAME_CONFLICT', message: 'Exists.' } });
  const fsError = await ipcMain.handlers.get('fs')(fromApp);
  assert.equal(fsError.error.code, 'PERMISSION_DENIED');
  assert.doesNotMatch(fsError.error.message, /Users/, 'file-system paths are not forwarded to the page');
});

test('one-way messages from other pages are ignored', () => {
  const ipcMain = fakeIpcMain();
  const ipc = createIpc({ ipcMain, isTrustedSender: url => url.startsWith('file:') });
  let calls = 0;
  ipc.on('cancel', () => calls++);
  ipcMain.listeners.get('cancel')(fromElsewhere);
  ipcMain.listeners.get('cancel')(fromApp);
  assert.equal(calls, 1);
});

test('validators reject malformed arguments', () => {
  assert.throws(() => validators.oneOf(['files', 'folder'])(['other']), { code: 'INVALID_INPUT' });
  assert.throws(() => validators.listAndBoolean([[], 'yes']), { code: 'INVALID_INPUT' });
  assert.throws(() => validators.object([[]]), { code: 'INVALID_INPUT' });
  assert.deepEqual(validators.twoStrings(['a', 'b', 'extra']), ['a', 'b']);
  assert.throws(() => validators.listAndObject([[], null]), { code: 'INVALID_INPUT' });
  assert.throws(() => validators.listAndObject([{}, {}]), { code: 'INVALID_INPUT' });
  assert.throws(() => validators.listAndObject([[], []]), { code: 'INVALID_INPUT' });
  assert.deepEqual(validators.listAndObject([[1], { layout: 'keep' }, 'extra']), [[1], { layout: 'keep' }]);
});
