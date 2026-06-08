// settings.js — first-run wizard + settings modal
import { MODELS, setProvider, getProvider, getModel, getModels } from '../../api/llm-client.js';
import * as icdClient from '../../api/icd-client.js';

const LS = {
  PROVIDER:    'llm_provider',
  API_KEY:     'llm_api_key',
  MODEL:       'llm_model',
  LIRMM_KEY:   'lirmm_api_key',
  ICD_PROXY:   'icd_proxy_url',
  SETUP_DONE:  'setup_done',
};

export function loadSettings() {
  return {
    provider:   localStorage.getItem(LS.PROVIDER)  || 'openai',
    apiKey:     localStorage.getItem(LS.API_KEY)   || '',
    model:      localStorage.getItem(LS.MODEL)     || '',
    lirmmKey:   localStorage.getItem(LS.LIRMM_KEY) || '',
    icdProxy:   localStorage.getItem(LS.ICD_PROXY) || 'https://draft.pen-secondary.workers.dev',
    setupDone:  localStorage.getItem(LS.SETUP_DONE) === 'true',
  };
}

export function applySettings() {
  const s = loadSettings();
  const model = s.model || MODELS[s.provider]?.[0] || '';
  setProvider(s.provider, s.apiKey, model);
  icdClient.init(s.lirmmKey, s.icdProxy);
}

function saveSettings(obj) {
  if (obj.provider)  localStorage.setItem(LS.PROVIDER, obj.provider);
  if (obj.apiKey)    localStorage.setItem(LS.API_KEY,  obj.apiKey);
  if (obj.model)     localStorage.setItem(LS.MODEL,    obj.model);
  localStorage.setItem(LS.LIRMM_KEY, obj.lirmmKey || '');
  localStorage.setItem(LS.ICD_PROXY, obj.icdProxy  || '');
  localStorage.setItem(LS.SETUP_DONE, 'true');
}

/* ─────────────────────────────────────────────────────────
   WIZARD (first-run, 3 steps)
───────────────────────────────────────────────────────── */
let _wizardStep = 1;
let _wizardData = {};

export function showWizard(onComplete) {
  _wizardStep = 1;
  _wizardData = { ...loadSettings() };

  const overlay = _buildWizardOverlay(onComplete);
  document.body.appendChild(overlay);
  _renderWizardStep(overlay);
}

function _buildWizardOverlay(onComplete) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'wizard-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'modal-dialog';
  dialog.innerHTML = `
    <div class="modal-header">
      <div class="modal-header__icon modal-header__icon--accent">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
        </svg>
      </div>
      <div class="modal-header__text">
        <div class="modal-header__title">Configuration initiale</div>
        <div class="modal-header__subtitle">Paramétrez vos clés API pour commencer</div>
      </div>
    </div>
    <div id="wizard-steps-bar" class="modal-body" style="padding-bottom:0; gap: var(--space-3)"></div>
    <div id="wizard-step-content" class="modal-body"></div>
    <div id="wizard-footer" class="modal-footer"></div>
  `;

  overlay.appendChild(dialog);
  overlay._onComplete = onComplete;
  return overlay;
}

function _renderWizardStep(overlay) {
  const stepsBar = overlay.querySelector('#wizard-steps-bar');
  const content  = overlay.querySelector('#wizard-step-content');
  const footer   = overlay.querySelector('#wizard-footer');

  // Steps bar
  stepsBar.innerHTML = `
    <div class="wizard-steps">
      ${[1,2,3].map(i => `
        <div class="wizard-step ${i < _wizardStep ? 'done' : ''} ${i === _wizardStep ? 'active' : ''}">
          <div class="wizard-step__dot">${i < _wizardStep ? '✓' : i}</div>
          <div class="wizard-step__label">${['Fournisseur LLM','CIM-10','Confirmation'][i-1]}</div>
          ${i < 3 ? '<div class="wizard-step__line"></div>' : ''}
        </div>
      `).join('')}
    </div>`;

  if (_wizardStep === 1) _renderStep1(content, footer, overlay);
  if (_wizardStep === 2) _renderStep2(content, footer, overlay);
  if (_wizardStep === 3) _renderStep3(content, footer, overlay);
}

function _renderStep1(content, footer, overlay) {
  content.innerHTML = `
    <div class="form-field">
      <label class="input-label">Fournisseur</label>
      <div class="provider-tabs" id="provider-tabs">
        ${['openai','anthropic','mistral'].map(p => `
          <button class="provider-tab ${_wizardData.provider === p ? 'active' : ''}" data-provider="${p}">
            ${{openai:'OpenAI',anthropic:'Anthropic',mistral:'Mistral'}[p]}
          </button>
        `).join('')}
      </div>
    </div>
    <div class="form-field">
      <label class="input-label">Clé API</label>
      <div class="password-input-wrap">
        <input id="wiz-api-key" type="password" class="input" placeholder="sk-..." value="${_wizardData.apiKey}">
        <button class="password-reveal" type="button" title="Afficher/masquer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="form-field">
      <label class="input-label">Modèle</label>
      <select id="wiz-model" class="input select"></select>
    </div>`;

  _populateModelSelect(content.querySelector('#wiz-model'), _wizardData.provider, _wizardData.model);

  // Provider tab clicks
  content.querySelector('#provider-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.provider-tab');
    if (!tab) return;
    content.querySelectorAll('.provider-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    _wizardData.provider = tab.dataset.provider;
    _populateModelSelect(content.querySelector('#wiz-model'), _wizardData.provider, '');
  });

  // Reveal toggle
  content.querySelector('.password-reveal').addEventListener('click', () => {
    const inp = content.querySelector('#wiz-api-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  footer.innerHTML = `<button class="btn btn-primary" id="wiz-next-1">Suivant →</button>`;
  footer.querySelector('#wiz-next-1').addEventListener('click', () => {
    _wizardData.apiKey = content.querySelector('#wiz-api-key').value.trim();
    _wizardData.model  = content.querySelector('#wiz-model').value;
    if (!_wizardData.apiKey) {
      content.querySelector('#wiz-api-key').focus();
      return;
    }
    _wizardStep = 2;
    _renderWizardStep(overlay);
  });
}

function _renderStep2(content, footer, overlay) {
  content.innerHTML = `
    <p class="text-sm text-muted" style="margin-bottom: var(--space-1)">
      Utilisé pour récupérer les descriptions détaillées des codes CIM-10.
      <strong>Optionnel</strong> — la recherche par code/mots-clés fonctionne sans clé.
    </p>
    <div class="form-field">
      <label class="input-label">Clé API LIRMM BioPortal</label>
      <div class="password-input-wrap">
        <input id="wiz-lirmm-key" type="password" class="input" placeholder="Votre clé API LIRMM" value="${_wizardData.lirmmKey || ''}">
        <button class="password-reveal" type="button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>
      <div class="input-hint">Obtenez une clé gratuite sur <strong>bioportal.lirmm.fr</strong></div>
    </div>
    <div class="form-field">
      <label class="input-label">URL du proxy Cloudflare Worker</label>
      <input id="wiz-icd-proxy" type="url" class="input" placeholder="https://cim10-proxy.yourname.workers.dev" value="${_wizardData.icdProxy || ''}">
      <div class="input-hint">Nécessaire pour contourner le CORS. Voir <strong>cloudflare-worker/icd-worker.js</strong> pour le déploiement.</div>
    </div>`;

  content.querySelector('.password-reveal').addEventListener('click', () => {
    const inp = content.querySelector('#wiz-lirmm-key');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  footer.innerHTML = `
    <button class="btn btn-ghost" id="wiz-back-2">← Retour</button>
    <button class="btn btn-primary" id="wiz-next-2">Suivant →</button>`;

  footer.querySelector('#wiz-back-2').addEventListener('click', () => { _wizardStep = 1; _renderWizardStep(overlay); });
  footer.querySelector('#wiz-next-2').addEventListener('click', () => {
    _wizardData.lirmmKey = content.querySelector('#wiz-lirmm-key').value.trim();
    _wizardData.icdProxy = content.querySelector('#wiz-icd-proxy').value.trim();
    _wizardStep = 3;
    _renderWizardStep(overlay);
  });
}

function _renderStep3(content, footer, overlay) {
  const mask = v => v ? v.slice(0, 4) + '****' + v.slice(-2) : '(vide)';
  content.innerHTML = `
    <div class="privacy-notice">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      </svg>
      Ces identifiants sont stockés uniquement dans le localStorage de votre navigateur. Ils ne sont jamais transmis ni partagés.
    </div>
    <div style="display:flex;flex-direction:column;gap:var(--space-2)">
      <div class="summary-item"><span class="summary-item__key">Fournisseur</span><span class="summary-item__value">${_wizardData.provider}</span></div>
      <div class="summary-item"><span class="summary-item__key">Clé API</span><span class="summary-item__value">${mask(_wizardData.apiKey)}</span></div>
      <div class="summary-item"><span class="summary-item__key">Modèle</span><span class="summary-item__value">${_wizardData.model}</span></div>
      <div class="summary-item"><span class="summary-item__key">Clé LIRMM</span><span class="summary-item__value">${_wizardData.lirmmKey ? mask(_wizardData.lirmmKey) : '(désactivé)'}</span></div>
      <div class="summary-item"><span class="summary-item__key">Proxy Worker</span><span class="summary-item__value">${_wizardData.icdProxy || '(non configuré)'}</span></div>
    </div>`;

  footer.innerHTML = `
    <button class="btn btn-ghost" id="wiz-back-3">← Retour</button>
    <button class="btn btn-primary" id="wiz-save">Enregistrer et commencer</button>`;

  footer.querySelector('#wiz-back-3').addEventListener('click', () => { _wizardStep = 2; _renderWizardStep(overlay); });
  footer.querySelector('#wiz-save').addEventListener('click', () => {
    saveSettings(_wizardData);
    applySettings();
    overlay.remove();
    overlay._onComplete?.();
  });
}

/* ─────────────────────────────────────────────────────────
   SETTINGS MODAL (gear icon)
───────────────────────────────────────────────────────── */
export function showSettings(onSave) {
  const s = loadSettings();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <div class="modal-header__icon modal-header__icon--accent">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </div>
        <div class="modal-header__text">
          <div class="modal-header__title">Paramètres</div>
          <div class="modal-header__subtitle">Modifier la configuration API</div>
        </div>
      </div>
      <div class="modal-body">
        <div class="form-field">
          <label class="input-label">Fournisseur</label>
          <div class="provider-tabs" id="settings-provider-tabs">
            ${['openai','anthropic','mistral'].map(p => `
              <button class="provider-tab ${s.provider === p ? 'active' : ''}" data-provider="${p}">
                ${{openai:'OpenAI',anthropic:'Anthropic',mistral:'Mistral'}[p]}
              </button>`).join('')}
          </div>
        </div>
        <div class="form-field">
          <label class="input-label">Clé API</label>
          <div class="password-input-wrap">
            <input id="s-api-key" type="password" class="input" value="${s.apiKey}" placeholder="sk-...">
            <button class="password-reveal" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="form-field">
          <label class="input-label">Modèle</label>
          <select id="s-model" class="input select"></select>
        </div>
        <div class="divider" style="margin:0"></div>
        <div class="form-field">
          <label class="input-label">Clé API LIRMM BioPortal <span class="text-muted">(optionnel)</span></label>
          <div class="password-input-wrap">
            <input id="s-lirmm-key" type="password" class="input" value="${s.lirmmKey}" placeholder="Clé LIRMM BioPortal">
            <button class="password-reveal" type="button">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
          <div class="input-hint">Obtenez une clé gratuite sur <strong>bioportal.lirmm.fr</strong></div>
        </div>
        <div class="form-field">
          <label class="input-label">URL proxy Cloudflare Worker <span class="text-muted">(CIM-10)</span></label>
          <input id="s-icd-proxy" type="url" class="input" value="${s.icdProxy}" placeholder="https://cim10-proxy.yourname.workers.dev">
          <div class="input-hint">Voir <strong>cloudflare-worker/icd-worker.js</strong> pour les instructions de déploiement.</div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="s-cancel">Annuler</button>
        <button class="btn btn-primary" id="s-save">Enregistrer</button>
      </div>
    </div>`;

  const currentProvider = { v: s.provider };
  const modelSel = overlay.querySelector('#s-model');
  _populateModelSelect(modelSel, currentProvider.v, s.model);

  overlay.querySelector('#settings-provider-tabs').addEventListener('click', e => {
    const tab = e.target.closest('.provider-tab');
    if (!tab) return;
    overlay.querySelectorAll('#settings-provider-tabs .provider-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentProvider.v = tab.dataset.provider;
    _populateModelSelect(modelSel, currentProvider.v, '');
  });

  overlay.querySelectorAll('.password-reveal').forEach(btn => {
    btn.addEventListener('click', () => {
      const inp = btn.previousElementSibling;
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
  });

  overlay.querySelector('#s-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('#s-save').addEventListener('click', () => {
    saveSettings({
      provider:  currentProvider.v,
      apiKey:    overlay.querySelector('#s-api-key').value.trim(),
      model:     overlay.querySelector('#s-model').value,
      lirmmKey:  overlay.querySelector('#s-lirmm-key').value.trim(),
      icdProxy:  overlay.querySelector('#s-icd-proxy').value.trim(),
    });
    applySettings();
    overlay.remove();
    onSave?.();
  });

  document.body.appendChild(overlay);
}

function _populateModelSelect(select, provider, currentModel) {
  const models = getModels(provider);
  select.innerHTML = models.map(m =>
    `<option value="${m}" ${m === currentModel ? 'selected' : ''}>${m}</option>`
  ).join('');
}
