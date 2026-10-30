/* Launch Game: starts The Sims 4 from the game folder chosen in Settings. The game itself hands over to the
   EA app or Steam as needed, so SimmerSpace does not need to know which store it came from. */
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { AppError } = require('./errors.cjs');

// Relative to the game folder; the first one that exists is used.
const GAME_EXECUTABLES = [path.join('Game', 'Bin', 'TS4_x64.exe'), path.join('Game', 'Bin', 'TS4_DX9_x64.exe'), path.join('Game', 'Bin', 'TS4.exe')];

async function findGameExecutable(gameFolder) {
  if (typeof gameFolder !== 'string' || !gameFolder) throw new AppError('GAME_FOLDER_NOT_SET', 'Choose the game folder first.');
  for (const relative of GAME_EXECUTABLES) {
    const candidate = path.join(gameFolder, relative);
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) return candidate;
  }
  throw new AppError('GAME_NOT_FOUND', 'The Sims 4 was not found in the chosen game folder.');
}

const GAME_PROCESS_NAMES = GAME_EXECUTABLES.map(file => path.basename(file).toLowerCase());

// Lists running program names with Windows' own tasklist. Anywhere else (or if tasklist fails) the answer is
// "unknown" rather than "not running", so callers can say they could not check.
function listWindowsProcesses() {
  return new Promise(resolve => {
    if (process.platform !== 'win32') return resolve(null);
    execFile('tasklist', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      resolve(String(stdout).split(/\r?\n/).map(line => line.split('","')[0].replace(/^"/, '').trim().toLowerCase()).filter(Boolean));
    });
  });
}

function createGameLauncher({ getGameFolder, openPath, listProcesses = listWindowsProcesses }) {
  // { running: true | false, checked: false when the process list could not be read }
  async function isRunning() {
    const names = await listProcesses().catch(() => null);
    if (!Array.isArray(names)) return { running: false, checked: false };
    return { running: names.some(name => GAME_PROCESS_NAMES.includes(String(name).toLowerCase())), checked: true };
  }
  let launchedAt = 0;
  async function launch() {
    // A double click should not start two copies.
    if (Date.now() - launchedAt < 8000) return { launched: true, repeated: true };
    const executable = await findGameExecutable(await getGameFolder());
    const problem = await openPath(executable);
    if (problem) throw new AppError('GAME_LAUNCH_FAILED', 'Windows could not start the game.');
    launchedAt = Date.now();
    return { launched: true };
  }
  return { launch, isRunning };
}

module.exports = { createGameLauncher, findGameExecutable, GAME_EXECUTABLES, GAME_PROCESS_NAMES };
