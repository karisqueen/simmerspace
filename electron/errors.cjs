/* Errors that cross the IPC boundary carry a stable code; the renderer turns codes into English/Spanish text. */
class AppError extends Error {
  constructor(code, message, details) {
    super(message || code);
    this.name = 'AppError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

const FS_CODES = {
  ENOENT: 'NOT_FOUND',
  EACCES: 'PERMISSION_DENIED',
  EPERM: 'PERMISSION_DENIED',
  EBUSY: 'FILE_BUSY',
  EEXIST: 'NAME_CONFLICT',
  ENOSPC: 'DISK_FULL',
  EROFS: 'READ_ONLY',
  ENAMETOOLONG: 'NAME_TOO_LONG'
};

function toAppError(error) {
  if (error instanceof AppError) return error;
  const code = FS_CODES[error?.code] || 'UNKNOWN';
  return new AppError(code, error?.message || 'The operation could not be completed.');
}

// Plain object safe to send over IPC. File-system messages can include absolute paths, so only
// AppError messages written by SimmerSpace are forwarded verbatim.
function serializeError(error) {
  const appError = toAppError(error);
  const known = error instanceof AppError;
  return {
    code: appError.code,
    message: known ? appError.message : 'The operation could not be completed.',
    ...(appError.details !== undefined ? { details: appError.details } : {})
  };
}

module.exports = { AppError, toAppError, serializeError };
