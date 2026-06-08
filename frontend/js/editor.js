// editor.js — result screen: editable monospace textarea + toolbar

let _onSave = null;
let _onBack = null;
let _isDirty = false;

const _el = {
  screen:   () => document.getElementById('screen-editor'),
  toolbar:  () => document.getElementById('editor-toolbar'),
  textarea: () => document.getElementById('editor-textarea'),
  status:   () => document.getElementById('editor-status'),
  wordCount:() => document.getElementById('editor-word-count'),
  charCount:() => document.getElementById('editor-char-count'),
};

export function show(reportText, onSave, onBack) {
  _onSave  = onSave;
  _onBack  = onBack;
  _isDirty = false;

  const ta = _el.textarea();
  ta.value = reportText;
  _updateCounts();
  _updateStatus();

  _el.screen().classList.add('active');
  ta.focus();

  window.addEventListener('beforeunload', _beforeUnload);
}

export function hide() {
  _el.screen().classList.remove('active');
  window.removeEventListener('beforeunload', _beforeUnload);
}

export function getContent() {
  return _el.textarea().value;
}

export function setContent(text) {
  _el.textarea().value = text;
  _updateCounts();
}

export function init() {
  const ta = _el.textarea();

  ta.addEventListener('input', () => {
    _isDirty = true;
    _updateCounts();
    _updateStatus();
  });

  document.getElementById('editor-btn-save')?.addEventListener('click', _handleSave);
  document.getElementById('editor-btn-copy')?.addEventListener('click', _handleCopy);
  document.getElementById('editor-btn-back')?.addEventListener('click', _handleBack);
}

async function _handleSave() {
  if (_onSave) {
    await _onSave(getContent());
    _isDirty = false;
    _updateStatus();
  }
}

async function _handleCopy() {
  try {
    await navigator.clipboard.writeText(getContent());
    const ta = _el.textarea();
    ta.classList.add('copy-flash');
    setTimeout(() => ta.classList.remove('copy-flash'), 500);

    const btn = document.getElementById('editor-btn-copy');
    const orig = btn.innerHTML;
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><path d="M20 6L9 17l-5-5"/></svg> Copié`;
    setTimeout(() => { btn.innerHTML = orig; }, 1800);
  } catch {
    // Clipboard API unavailable — silent fail
  }
}

function _handleBack() {
  if (_isDirty) {
    if (!confirm('Des modifications non enregistrées seront perdues. Continuer ?')) return;
  }
  hide();
  _onBack?.();
}

function _beforeUnload(e) {
  if (_isDirty) { e.preventDefault(); e.returnValue = ''; }
}

function _updateCounts() {
  const text  = getContent();
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  const wc = _el.wordCount();
  const cc = _el.charCount();
  if (wc) wc.textContent = `${words} mot${words !== 1 ? 's' : ''}`;
  if (cc) cc.textContent = `${chars} caractère${chars !== 1 ? 's' : ''}`;
}

function _updateStatus() {
  const st = _el.status();
  if (!st) return;
  if (_isDirty) {
    st.textContent = '● Non enregistré';
    st.className = 'editor-status editor-status--unsaved';
  } else {
    st.textContent = 'Enregistré';
    st.className = 'editor-status';
  }
}
