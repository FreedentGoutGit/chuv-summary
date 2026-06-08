// file-handler.js — File System Access API + download fallback

let _dirHandle = null;

export function isFileSystemAccessSupported() {
  return typeof window.showDirectoryPicker === 'function';
}

export async function requestSaveDirectory() {
  if (!isFileSystemAccessSupported()) return false;
  try {
    _dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    return true;
  } catch (err) {
    if (err.name !== 'AbortError') console.warn('[FileHandler] directory picker error:', err);
    return false;
  }
}

export function hasSaveDirectory() {
  return !!_dirHandle;
}

/**
 * Save a .txt report to the chosen directory, or trigger a download.
 * @param {string} content
 * @param {string} filename  e.g. "rapport_2024-01-15.txt"
 */
export async function saveReport(content, filename) {
  if (_dirHandle) {
    await _writeFile(_dirHandle, filename, content, 'text/plain');
  } else {
    _triggerDownload(content, filename, 'text/plain');
  }
}

/**
 * Save a past-prompt JSON to the chosen directory, or trigger a download.
 * @param {object} data
 * @param {string} filename  e.g. "past_prompt_2024-01-15_14-30_psychiatrie-urgence.json"
 */
export async function savePrompt(data, filename) {
  const text = JSON.stringify(data, null, 2);
  if (_dirHandle) {
    await _writeFile(_dirHandle, filename, text, 'application/json');
  } else {
    _triggerDownload(text, filename, 'application/json');
  }
}

/**
 * List past prompt JSON files from the save directory.
 * @returns {Promise<Array<{ name: string, handle: FileSystemFileHandle }>>}
 */
export async function listPastPrompts() {
  if (!_dirHandle) return [];
  const results = [];
  try {
    for await (const [name, handle] of _dirHandle.entries()) {
      if (handle.kind === 'file' && name.startsWith('past_prompt_') && name.endsWith('.json')) {
        results.push({ name, handle });
      }
    }
  } catch (err) {
    console.warn('[FileHandler] listPastPrompts error:', err);
  }
  return results.sort((a, b) => b.name.localeCompare(a.name)); // newest first
}

/**
 * Read a file from a FileSystemFileHandle.
 * @param {FileSystemFileHandle} handle
 * @returns {Promise<string>}
 */
export async function loadFile(handle) {
  const file = await handle.getFile();
  return file.text();
}

/**
 * Read a File object (from <input type="file">).
 * @param {File} file
 * @returns {Promise<string>}
 */
export function loadFileFromInput(file) {
  return file.text();
}

/**
 * Generate a filename for a past prompt.
 * @param {string} templateId
 * @returns {string}
 */
export function pastPromptFilename(templateId) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `past_prompt_${date}_${time}_${templateId}.json`;
}

/**
 * Generate a filename for the report.
 * @param {string} templateId
 * @returns {string}
 */
export function reportFilename(templateId) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  return `rapport_${date}_${time}_${templateId}.txt`;
}

async function _writeFile(dirHandle, filename, content, mimeType) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable   = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
}

function _triggerDownload(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
