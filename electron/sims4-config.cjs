/* The Sims 4's own settings: Options.ini in the game's documents folder. Only three keys are ever changed, the same
   ones the game's Game Options > Other screen writes:
     showmodliststartup  1 = list CC and mods at startup
     modsdisabled        1 = CC and mods OFF (inverted compared with the game's "Enable Custom Content and Mods")
     scriptmodsenabled   1 = script mods allowed
   Every other line stays byte for byte as it was. The first change keeps a backup of the original file, each write
   is atomic, and a file changed by something else since it was read is read again rather than overwritten. The game
   rewrites this file when it closes, so nothing is written while it is running. */
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { AppError } = require('./errors.cjs');

const OPTIONS_FILE = 'Options.ini';
const BACKUP_SUFFIX = '.simmerspace-original';
const KEYS = { showModList: { key: 'showmodliststartup', inverted: false }, modsEnabled: { key: 'modsdisabled', inverted: true }, scriptMods: { key: 'scriptmodsenabled', inverted: false } };
const SECTION = /^\s*\[options\]\s*$/i;

function keyPattern(key) {
  return new RegExp(`^(\\s*${key}\\s*=\\s*)([^\\r\\n]*?)(\\s*)$`, 'im');
}

function readValues(text) {
  if (!text.split(/\r?\n/).some(line => SECTION.test(line))) throw new AppError('CONFIG_INVALID', 'Options.ini does not look like a Sims 4 settings file.');
  const values = {};
  const present = {};
  for (const [name, { key, inverted }] of Object.entries(KEYS)) {
    const match = keyPattern(key).exec(text);
    present[name] = !!match;
    if (match && !/^[01]$/.test(match[2].trim())) throw new AppError('CONFIG_INVALID', `The value of ${key} is not one the game writes.`);
    // The game's defaults when a key is missing: nothing is enabled until the player turns it on.
    const raw = match ? match[2].trim() === '1' : inverted;
    values[name] = inverted ? !raw : raw;
  }
  return { values, present };
}

function applyValues(text, changes) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  let next = text;
  for (const [name, wanted] of Object.entries(changes)) {
    const rule = KEYS[name];
    if (!rule || typeof wanted !== 'boolean') continue;
    const value = (rule.inverted ? !wanted : wanted) ? '1' : '0';
    const pattern = keyPattern(rule.key);
    if (pattern.test(next)) next = next.replace(pattern, (_all, head, _old, tail) => `${head}${value}${tail}`);
    else next = next.replace(/^(\s*\[options\]\s*?)(\r?\n)/im, `$1$2${rule.key} = ${value}${eol}`);
  }
  return next;
}

const fingerprint = text => crypto.createHash('sha256').update(text).digest('hex');

function createSims4Config({ getDocumentsRoute, getDocumentsFolder, getSelected, saveSelected, isGameRunning = async () => ({ running: false, checked: false }) }) {
  // Sims 4 folders under Documents\Electronic Arts. The folder is named after the game's language ("The Sims 4",
  // "Los Sims 4", "Die Sims 4"...), so any folder with "Sims 4" in its name or the chosen Documents route counts.
  async function folders() {
    const base = path.join(getDocumentsFolder(), 'Electronic Arts');
    const found = new Map();
    const add = async folder => {
      if (!folder) return;
      const stat = await fs.stat(path.join(folder, OPTIONS_FILE)).catch(() => null);
      if (stat?.isFile()) found.set(path.resolve(folder).toLowerCase(), { path: path.resolve(folder), name: path.basename(folder), modified: stat.mtimeMs });
    };
    await add(await getDocumentsRoute());
    const entries = await fs.readdir(base, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) if (entry.isDirectory() && /\bsims\s*4\b/i.test(entry.name)) await add(path.join(base, entry.name));
    return [...found.values()];
  }

  async function chosenFolder(list) {
    const saved = String((await getSelected()) || '').toLowerCase();
    const route = String((await getDocumentsRoute()) || '').toLowerCase();
    return list.find(item => item.path.toLowerCase() === saved) || list.find(item => item.path.toLowerCase() === route) || [...list].sort((a, b) => b.modified - a.modified)[0] || null;
  }

  async function read() {
    const list = await folders();
    const game = await isGameRunning();
    const base = { folders: list.map(({ path: folder, name }) => ({ path: folder, name })), gameRunning: game.running === true, gameChecked: game.checked === true };
    const selected = await chosenFolder(list);
    if (!selected) return { ...base, status: 'missing', folder: '', values: null };
    const file = path.join(selected.path, OPTIONS_FILE);
    let text;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return { ...base, status: 'unreadable', folder: selected.path, values: null };
    }
    try {
      return { ...base, status: 'ready', folder: selected.path, file, multiple: list.length > 1, ...readValues(text), version: fingerprint(text) };
    } catch {
      return { ...base, status: 'invalid', folder: selected.path, values: null };
    }
  }

  async function selectFolder(folder) {
    const list = await folders();
    const match = list.find(item => item.path.toLowerCase() === String(folder).toLowerCase());
    if (!match) throw new AppError('CONFIG_FOLDER_UNKNOWN', 'That folder is not a Sims 4 settings folder.');
    await saveSelected(match.path);
    return read();
  }

  async function write({ values, version } = {}) {
    if (!values || typeof values !== 'object') throw new AppError('INVALID_INPUT', 'Settings were expected.');
    const game = await isGameRunning();
    if (game.running) throw new AppError('CONFIG_GAME_RUNNING', 'Close The Sims 4 before changing its settings.');
    const current = await read();
    if (current.status === 'missing') throw new AppError('CONFIG_MISSING', 'Options.ini was not found. Start the game once so it creates the file.');
    if (current.status !== 'ready') throw new AppError(current.status === 'invalid' ? 'CONFIG_INVALID' : 'CONFIG_UNREADABLE', 'Options.ini could not be read, so it was left as it is.');
    if (version && version !== current.version) throw new AppError('CONFIG_CHANGED', 'Options.ini changed since it was read.');
    const text = await fs.readFile(current.file, 'utf8');
    const next = applyValues(text, values);
    if (next === text) return { ...current, saved: false };
    const backup = `${current.file}${BACKUP_SUFFIX}`;
    if (!(await fs.lstat(backup).catch(() => null))) await fs.copyFile(current.file, backup);
    const temp = `${current.file}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.writeFile(temp, next, 'utf8');
      await fs.rename(temp, current.file);
    } catch (error) {
      await fs.unlink(temp).catch(() => {});
      throw new AppError('CONFIG_WRITE_FAILED', 'Options.ini could not be saved.', { reason: error.code });
    }
    const saved = await read();
    const matches = Object.entries(values).every(([name, wanted]) => saved.values?.[name] === wanted);
    if (!matches) throw new AppError('CONFIG_WRITE_FAILED', 'The saved file does not show the new settings.');
    return { ...saved, saved: true };
  }

  return { read, write, selectFolder };
}

module.exports = { createSims4Config, readValues, applyValues, KEYS, OPTIONS_FILE, BACKUP_SUFFIX };
