/* A small, strict ZIP reader for CurseForge downloads. It supports stored and deflated entries, checks every
   entry's CRC, refuses encrypted, ZIP64 and multi-disk archives, and never trusts entry names: anything that
   could escape the destination folder (absolute paths, drive letters, "..") is rejected. */
const zlib = require('node:zlib');
const { AppError } = require('./errors.cjs');

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 2 * 1024 ** 3;
const MAX_RATIO = 400; // uncompressed / compressed, beyond which an entry looks like a zip bomb

function bad(message) {
  return new AppError('ZIP_INVALID', message);
}

function findEndOfCentralDirectory(buffer) {
  const stop = Math.max(0, buffer.length - 22 - 0xffff);
  for (let offset = buffer.length - 22; offset >= stop; offset--) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw bad('This download is not a valid ZIP file.');
}

// Returns a safe relative path using "/" separators, or '' when the entry must be skipped or is unsafe.
function safeEntryPath(rawName) {
  const name = rawName.replace(/\\/g, '/');
  if (!name || name.includes('\0') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return '';
  const parts = name.split('/').filter(part => part !== '' && part !== '.');
  if (!parts.length || parts.some(part => part === '..')) return '';
  if (parts[0] === '__MACOSX' || parts.some(part => part.startsWith('._'))) return '';
  return parts.join('/');
}

// Lists the archive's entries. Each file entry has `path`, `size` and `read()` (which inflates and checks it).
function readZip(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw bad('This download is not a valid ZIP file.');
  const eocd = findEndOfCentralDirectory(buffer);
  const disk = buffer.readUInt16LE(eocd + 4);
  const count = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (disk !== 0) throw bad('Multi-part ZIP files are not supported.');
  if (count === 0xffff || centralOffset === 0xffffffff) throw bad('ZIP64 archives are not supported.');
  if (count > MAX_ENTRIES) throw bad('This archive has too many files.');
  if (centralOffset + centralSize > eocd) throw bad('This download is not a valid ZIP file.');

  const entries = [];
  const unsafe = [];
  let total = 0;
  let offset = centralOffset;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== CENTRAL_SIGNATURE) throw bad('The ZIP file list is damaged.');
    const flags = buffer.readUInt16LE(offset + 8);
    const method = buffer.readUInt16LE(offset + 10);
    const crc = buffer.readUInt32LE(offset + 16);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const size = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const rawName = buffer.toString(flags & 0x800 ? 'utf8' : 'latin1', offset + 46, offset + 46 + nameLength);
    offset += 46 + nameLength + extraLength + commentLength;

    if (rawName.endsWith('/') || rawName.endsWith('\\')) continue; // folder entry
    const entryPath = safeEntryPath(rawName);
    if (!entryPath) {
      unsafe.push(rawName);
      continue;
    }
    if (flags & 0x1) throw bad('Password-protected ZIP files are not supported.');
    if (method !== 0 && method !== 8) throw bad('This ZIP uses a compression method SimmerSpace cannot read.');
    if (compressedSize === 0xffffffff || size === 0xffffffff) throw bad('ZIP64 archives are not supported.');
    if (size > 50 * 1024 ** 2 && compressedSize > 0 && size / compressedSize > MAX_RATIO) throw bad('An entry in this ZIP is suspiciously large.');
    total += size;
    if (total > MAX_TOTAL_BYTES) throw bad('This archive is too large to unpack.');

    entries.push({
      path: entryPath,
      size,
      read() {
        if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) throw bad('A file inside the ZIP is damaged.');
        const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
        const raw = buffer.subarray(start, start + compressedSize);
        if (raw.length !== compressedSize) throw bad('A file inside the ZIP is cut short.');
        let data;
        try {
          data = method === 0 ? Buffer.from(raw) : zlib.inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
        } catch {
          throw bad('A file inside the ZIP could not be unpacked.');
        }
        if (data.length !== size || zlib.crc32(data) !== crc) throw bad('A file inside the ZIP failed its integrity check.');
        return data;
      }
    });
  }
  return { entries, unsafe };
}

module.exports = { readZip, safeEntryPath };
