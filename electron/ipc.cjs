/* IPC helpers: only the app's own page may call handlers, and results travel as { ok, value | error }. */
const { AppError, serializeError } = require('./errors.cjs');

function createIpc({ ipcMain, isTrustedSender }) {
  function trusted(event) {
    return isTrustedSender(event.senderFrame?.url || event.sender?.getURL?.() || '');
  }

  // `validate` receives the raw arguments and returns the arguments to pass on, or throws.
  function handle(channel, validate, handler) {
    ipcMain.handle(channel, async (event, ...args) => {
      if (!trusted(event)) return { ok: false, error: { code: 'FORBIDDEN', message: 'Request rejected.' } };
      try {
        return { ok: true, value: await handler(...validate(args)) };
      } catch (error) {
        return { ok: false, error: serializeError(error) };
      }
    });
  }

  function on(channel, handler) {
    ipcMain.on(channel, (event, ...args) => {
      if (trusted(event)) handler(...args);
    });
  }

  return { handle, on };
}

const validators = {
  none: () => [],
  oneOf: values => args => {
    if (!values.includes(args[0])) throw new AppError('INVALID_INPUT', 'Unsupported request.');
    return [args[0]];
  },
  string: args => {
    if (typeof args[0] !== 'string' || args[0].length > 4096) throw new AppError('INVALID_INPUT', 'A file path was expected.');
    return [args[0]];
  },
  twoStrings: args => {
    if (typeof args[0] !== 'string' || typeof args[1] !== 'string' || args[0].length > 4096 || args[1].length > 400) {
      throw new AppError('INVALID_INPUT', 'A file path and a name were expected.');
    }
    return [args[0], args[1]];
  },
  list: args => {
    if (!Array.isArray(args[0])) throw new AppError('INVALID_INPUT', 'A list was expected.');
    return [args[0]];
  },
  listAndBoolean: args => {
    if (!Array.isArray(args[0]) || typeof args[1] !== 'boolean') throw new AppError('INVALID_INPUT', 'A list and a setting were expected.');
    return [args[0], args[1]];
  },
  listAndObject: args => {
    if (!Array.isArray(args[0]) || !args[1] || typeof args[1] !== 'object' || Array.isArray(args[1])) {
      throw new AppError('INVALID_INPUT', 'A list and options were expected.');
    }
    return [args[0], args[1]];
  },
  object: args => {
    if (!args[0] || typeof args[0] !== 'object' || Array.isArray(args[0])) throw new AppError('INVALID_INPUT', 'Data was expected.');
    return [args[0]];
  }
};

module.exports = { createIpc, validators };
