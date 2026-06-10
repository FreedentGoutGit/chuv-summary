// app.js — main controller, state owner, screen router
import { loadSettings, applySettings, showWizard, showSettings } from './settings.js';
import { render as renderForm, getValues, setValues, destroy as destroyForm } from './form-renderer.js';
import * as fileHandler from './file-handler.js';
import * as editor from './editor.js';
import { complete as llmComplete, isConfigured as llmIsConfigured } from '../../api/llm-client.js';
import { buildPrompt } from '../../api/prompt-builder.js';

// ── App state ──────────────────────────────────────────
const state = {
  screen:          'home',  // 'home' | 'form' | 'editor'
  loadedTemplate:  null,
  generatedReport: '',
};

// ── Init ───────────────────────────────────────────────
export async function init() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  // Apply stored settings
  applySettings();

  // Wire static UI
  editor.init();
  _wireHomeButtons();
  _wireNavBarButtons();
  document.getElementById('btn-generate')?.addEventListener('click', _handleFormSubmitIntent);

  // Show wizard if setup not done or no API key
  const s = loadSettings();
  if (!s.setupDone || !s.apiKey) {
    showWizard(() => navigateTo('home'));
  } else {
    navigateTo('home');
  }
}

// ── Screen router ──────────────────────────────────────
export function navigateTo(screen, data = {}) {
  // Hide all screens
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'));
  // Hide editor (managed separately)
  editor.hide();

  state.screen = screen;

  if (screen === 'home') {
    _renderHome();
    document.getElementById('screen-home').classList.add('active');
  } else if (screen === 'form') {
    state.loadedTemplate = data.template;
    _renderFormScreen(data.template, data.initialValues);
    document.getElementById('screen-form').classList.add('active');
  } else if (screen === 'editor') {
    state.generatedReport = data.report || '';
    editor.show(state.generatedReport, _handleReportSave, () => navigateTo('form', { template: state.loadedTemplate }));
    document.getElementById('screen-editor').classList.add('active');
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Home screen ─────────────────────────────────────────
async function _renderHome() {
  const container = document.getElementById('home-template-grid');
  const pastList  = document.getElementById('home-past-list');
  const pastSection = document.getElementById('home-past-section');

  // Load template list
  const templates = await _loadTemplateList();
  container.innerHTML = '';
  for (const tpl of templates) {
    const card = _makeTemplateCard(tpl);
    container.appendChild(card);
  }

  // Past prompts
  const pasts = await fileHandler.listPastPrompts();
  if (pasts.length > 0) {
    pastSection.style.display = '';
    pastList.innerHTML = '';
    for (const p of pasts.slice(0, 8)) {
      pastList.appendChild(_makePastPromptItem(p));
    }
  } else {
    pastSection.style.display = 'none';
  }
}

function _makeTemplateCard(tpl) {
  const card = document.createElement('button');
  card.className = 'card card-interactive';
  card.style.textAlign = 'left';
  card.style.width = '100%';
  card.innerHTML = `
    <div class="card__body">
      <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3)">
        <div class="template-card__icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            <polyline points="10 9 9 9 8 9"/>
          </svg>
        </div>
        <div>
          <div class="card__title">${_escHtml(tpl.report_type)}</div>
          <div class="card__subtitle">${tpl.fields?.length ?? 0} sections</div>
        </div>
      </div>
    </div>`;
  card.addEventListener('click', () => navigateTo('form', { template: tpl }));
  return card;
}

function _makePastPromptItem(p) {
  const btn = document.createElement('button');
  btn.className = 'past-prompt-item';
  const date = _formatPastPromptDate(p.name);
  btn.innerHTML = `
    <span class="past-prompt-item__icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
    </span>
    <span class="past-prompt-item__name">${_escHtml(p.name.replace(/^past_prompt_/, '').replace(/\.json$/, ''))}</span>
    <span class="past-prompt-item__date">${date}</span>`;
  btn.addEventListener('click', async () => {
    try {
      const raw  = await fileHandler.loadFile(p.handle);
      const data = JSON.parse(raw);
      if (!data.template || !data.fieldValues) return;
      navigateTo('form', { template: data.template, initialValues: data.fieldValues });
    } catch (err) {
      console.error('[App] failed to load past prompt:', err);
    }
  });
  return btn;
}

async function _loadTemplateList() {
  try {
    const res = await fetch('./templates/psychiatrie-urgence.json');
    const tpl = await res.json();
    return [tpl];
  } catch {
    return [];
  }
}

// ── Form screen ─────────────────────────────────────────
function _renderFormScreen(template, initialValues) {
  // Set nav bar title
  document.getElementById('nav-form-title').textContent = template.report_type;

  const container = document.getElementById('form-fields-container');
  destroyForm();
  renderForm(template, container, _handleFormSubmitIntent, initialValues || {});
}

// ── Privacy reminder → submit ────────────────────────────
function _handleFormSubmitIntent() {
  _showPrivacyReminder(() => _handleFormSubmit());
}

function _showPrivacyReminder(onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-header__icon modal-header__icon--warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="modal-header__text">
          <div class="modal-header__title">Vérification avant envoi</div>
          <div class="modal-header__subtitle">Assurez-vous qu'aucune donnée confidentielle ne figure dans le texte.</div>
        </div>
      </div>
      <div class="modal-body">
        <ul class="privacy-list">
          <li>Nom et prénom du patient</li>
          <li>Date de naissance</li>
          <li>Adresse</li>
          <li>Numéro de sécurité sociale ou d'assurance</li>
          <li>Tout autre identifiant personnel</li>
        </ul>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="privacy-cancel">Annuler</button>
        <button class="btn btn-primary" id="privacy-confirm">Confirmer et envoyer</button>
      </div>
    </div>`;

  overlay.querySelector('#privacy-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#privacy-confirm').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });

  document.body.appendChild(overlay);
}

async function _handleFormSubmit() {
  if (!llmIsConfigured()) {
    showSettings(() => {});
    return;
  }

  const fieldValues = getValues();
  const { systemPrompt, userMessage } = buildPrompt(state.loadedTemplate, fieldValues);

  // Collect raw ICD descriptions to append untouched after the LLM output
  const rawAppendices = [];
  for (const [id, fv] of Object.entries(fieldValues)) {
    if (fv.icdRaw) {
      const field = state.loadedTemplate.fields.find(f => f.id === id);
      rawAppendices.push(`— ${field?.label || id} — Référence ICD —\n${fv.icdRaw}`);
    }
  }

  _showLoading('Génération du rapport en cours...');

  try {
    const result = await llmComplete(systemPrompt, userMessage);
    _hideLoading();

    const finalReport = rawAppendices.length
      ? result.trimEnd() + '\n\n\n' + rawAppendices.join('\n\n')
      : result;

    await _autoSavePrompt(fieldValues);
    navigateTo('editor', { report: finalReport });
  } catch (err) {
    _hideLoading();
    _showError(err.message || 'Une erreur est survenue lors de la génération.');
  }
}

// ── Save prompt ─────────────────────────────────────────
async function _handleSaveCurrentPrompt() {
  const fieldValues = getValues();
  await _autoSavePrompt(fieldValues);
  _showToast('Brouillon enregistré');
}

async function _autoSavePrompt(fieldValues) {
  const data = {
    template:    state.loadedTemplate,
    fieldValues,
    savedAt:     new Date().toISOString(),
  };
  const filename = fileHandler.pastPromptFilename(state.loadedTemplate.template_id);

  if (!fileHandler.hasSaveDirectory()) {
    const picked = await fileHandler.requestSaveDirectory();
    if (!picked) {
      // Fallback: trigger download of the past prompt JSON
      await fileHandler.savePrompt(data, filename);
      return;
    }
  }

  await fileHandler.savePrompt(data, filename);
}

// ── Save report ─────────────────────────────────────────
async function _handleReportSave(content) {
  const filename = fileHandler.reportFilename(state.loadedTemplate?.template_id || 'rapport');

  if (!fileHandler.hasSaveDirectory()) {
    const picked = await fileHandler.requestSaveDirectory();
    if (!picked) {
      await fileHandler.saveReport(content, filename);
      return;
    }
  }

  await fileHandler.saveReport(content, filename);
  _showToast('Rapport enregistré');
}

// ── Nav bar wiring ──────────────────────────────────────
function _wireNavBarButtons() {
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    showSettings(() => {});
  });

  document.getElementById('btn-save-prompt')?.addEventListener('click', _handleSaveCurrentPrompt);

  document.getElementById('btn-back-home')?.addEventListener('click', () => {
    if (confirm('Revenir à l\'accueil ? Les modifications non enregistrées seront perdues.')) {
      navigateTo('home');
    }
  });
}

function _wireHomeButtons() {
  // File input fallback for loading past prompts
  const fileInput = document.getElementById('past-prompt-file-input');
  fileInput?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const raw  = await fileHandler.loadFileFromInput(file);
      const data = JSON.parse(raw);
      if (data.template && data.fieldValues) {
        navigateTo('form', { template: data.template, initialValues: data.fieldValues });
      }
    } catch {
      _showError('Fichier invalide.');
    }
    e.target.value = '';
  });

  document.getElementById('btn-pick-directory')?.addEventListener('click', async () => {
    const ok = await fileHandler.requestSaveDirectory();
    if (ok) _renderHome();
  });
}

// ── Loading overlay ─────────────────────────────────────
function _showLoading(message) {
  const el = document.getElementById('loading-overlay');
  if (!el) return;
  el.querySelector('.loading-card__message').textContent = message;
  el.classList.remove('hidden');
}

function _hideLoading() {
  document.getElementById('loading-overlay')?.classList.add('hidden');
}

// ── Toast / error helpers ───────────────────────────────
function _showError(message) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-header__icon" style="background:var(--color-danger-light);color:var(--color-danger)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="modal-header__text">
          <div class="modal-header__title">Erreur</div>
          <div class="modal-header__subtitle">${_escHtml(message)}</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" id="err-ok">OK</button>
      </div>
    </div>`;
  overlay.querySelector('#err-ok').addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function _showToast(message) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed; bottom:80px; left:50%; transform:translateX(-50%);
    background:#1e293b; color:white; padding:10px 20px; border-radius:99px;
    font-size:0.875rem; font-weight:500; z-index:300; pointer-events:none;
    box-shadow:0 4px 12px rgba(0,0,0,0.15); animation: fadeIn 0.2s ease;`;
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function _formatPastPromptDate(filename) {
  const m = filename.match(/past_prompt_(\d{4}-\d{2}-\d{2})_(\d{2}-\d{2})/);
  if (!m) return '';
  return `${m[1]} ${m[2].replace('-', ':')}`;
}

function _escHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
