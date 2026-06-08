// form-renderer.js — renders the form from a JSON template, manages toggles + ICD widgets
import * as icdClient from '../../api/icd-client.js';
import { formatICDResult, formatICDTitle, formatICDDescription } from '../../api/prompt-builder.js';

let _template   = null;
let _container  = null;
let _onSubmit   = null;

// Internal state: { [fieldId]: { mode: 'paragraph'|'notes', paragraphValue: string, notesValue: string } }
const _state = {};

/**
 * Render the form into container.
 * @param {object}   template      - loaded JSON template
 * @param {Element}  container     - DOM element to render into
 * @param {Function} onSubmit      - called with fieldValues when form is submitted
 * @param {object}   initialValues - optional { [fieldId]: { mode, value } } for pre-fill
 */
export function render(template, container, onSubmit, initialValues = {}) {
  _template  = template;
  _container = container;
  _onSubmit  = onSubmit;

  // Initialize state
  for (const field of template.fields) {
    const iv = initialValues[field.id];
    if (field.widget === 'arret_travail') {
      const savedValue = iv?.value || '';
      const noneText = field.prewritten_none || 'Aucun arrêt de travail prescrit.';
      _state[field.id] = {
        mode: 'paragraph',
        paragraphValue: savedValue || noneText,
        notesValue: '',
        arretPrescrit: !!(savedValue && savedValue !== noneText),
      };
    } else {
      _state[field.id] = {
        mode:           iv?.mode || field.default_mode || 'paragraph',
        paragraphValue: iv?.mode === 'paragraph' ? iv.value : (field.prewritten || ''),
        notesValue:     iv?.mode === 'notes'     ? iv.value : '',
      };
    }
  }

  container.innerHTML = '';

  // Group fields by parent (level-1 direct fields have no parent)
  const sections = _groupBySections(template.fields);

  // Render section numbering counter
  let sectionNum = 0;
  for (const section of sections) {
    sectionNum++;
    container.appendChild(_renderSection(section, sectionNum));
  }
}

export function getValues() {
  const out = {};
  for (const [id, s] of Object.entries(_state)) {
    out[id] = {
      mode:  s.mode,
      value: s.mode === 'paragraph' ? s.paragraphValue : s.notesValue,
    };
    if (s.icdRaw) out[id].icdRaw = s.icdRaw;
  }
  return out;
}

export function setValues(values) {
  for (const [id, v] of Object.entries(values)) {
    if (!_state[id]) continue;
    _state[id].mode = v.mode;
    if (v.mode === 'paragraph') _state[id].paragraphValue = v.value;
    else                        _state[id].notesValue     = v.value;
  }
}

export function destroy() {
  if (_container) _container.innerHTML = '';
  Object.keys(_state).forEach(k => delete _state[k]);
}

/* ── Grouping logic ─────────────────────────────────────── */
function _groupBySections(fields) {
  const sectionsMap  = new Map(); // parent key → { label, fields[] }
  const topLevel     = [];

  for (const field of fields) {
    if (field.level === 1) {
      // A standalone level-1 section (no children expected)
      topLevel.push({ type: 'standalone', field });
    } else if (field.level === 2 && field.parent) {
      if (!sectionsMap.has(field.parent)) {
        sectionsMap.set(field.parent, { parentKey: field.parent, parentLabel: field.parent_label || field.parent, fields: [] });
      }
      sectionsMap.get(field.parent).fields.push(field);
    }
  }

  // Interleave: look at original order of first appearance
  const result = [];
  const seen   = new Set();

  for (const field of fields) {
    if (field.level === 1) {
      result.push({ type: 'standalone', field });
    } else if (field.level === 2 && field.parent && !seen.has(field.parent)) {
      seen.add(field.parent);
      result.push({ type: 'group', ...sectionsMap.get(field.parent) });
    }
  }

  return result;
}

/* ── Section rendering ──────────────────────────────────── */
function _renderSection(section, num) {
  const card = document.createElement('div');
  card.className = 'section-card';

  if (section.type === 'standalone') {
    const f = section.field;
    card.innerHTML = `
      <div class="section-card__header">
        <div class="section-card__number">${num}</div>
        <div class="section-card__title">${_escHtml(f.label)}</div>
        ${f.required ? '<span class="badge badge-accent">Requis</span>' : ''}
      </div>
      <div class="section-card__body" id="section-body-${f.id}"></div>`;
    const body = card.querySelector(`#section-body-${f.id}`);
    body.appendChild(_renderField(f));
  } else {
    // Group of level-2 fields
    card.innerHTML = `
      <div class="section-card__header">
        <div class="section-card__number">${num}</div>
        <div class="section-card__title">${_escHtml(section.parentLabel)}</div>
      </div>
      <div class="section-card__body" id="section-body-${section.parentKey}"></div>`;
    const body = card.querySelector(`#section-body-${section.parentKey}`);
    for (const f of section.fields) {
      body.appendChild(_renderField(f));
    }
  }

  return card;
}

/* ── Field rendering ────────────────────────────────────── */
function _renderField(field) {
  if (field.widget === 'arret_travail') return _renderArretWidget(field);

  const s     = _state[field.id];
  const block = document.createElement('div');
  block.className = 'field-block';
  block.id        = `field-${field.id}`;

  // Header: label + toggle
  block.innerHTML = `
    <div class="field-block__header">
      <div class="field-block__label">
        ${_escHtml(field.label)}
        ${field.required ? '<span class="required-star">*</span>' : ''}
      </div>
      <div class="toggle-group" role="group" aria-label="Mode de saisie">
        <button class="toggle-btn" data-mode="paragraph" aria-pressed="${s.mode === 'paragraph'}">
          Paragraphe
        </button>
        <button class="toggle-btn" data-mode="notes" aria-pressed="${s.mode === 'notes'}">
          Notes
        </button>
      </div>
    </div>
    <div class="field-block__body">
      <div class="field-panel ${s.mode === 'paragraph' ? 'active' : ''}" data-panel="paragraph">
        ${_renderParagraphPanel(field)}
      </div>
      <div class="field-panel ${s.mode === 'notes' ? 'active' : ''}" data-panel="notes">
        ${_renderNotesPanel(field)}
      </div>
    </div>`;

  // Toggle buttons
  block.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => _handleToggle(field.id, btn.dataset.mode, block));
  });

  // Textarea sync to state
  const paraTa = block.querySelector('[data-panel="paragraph"] .field-textarea');
  const notesTa = block.querySelector('[data-panel="notes"] .field-textarea');

  paraTa.value = s.paragraphValue;
  notesTa.value = s.notesValue;

  paraTa.addEventListener('input', () => { _state[field.id].paragraphValue = paraTa.value; });
  notesTa.addEventListener('input', () => { _state[field.id].notesValue    = notesTa.value; });

  // Prewritten options dropdown
  if (field.prewritten_options?.length) {
    const sel = block.querySelector('.prewritten-select');
    if (sel) {
      sel.addEventListener('change', () => {
        if (!sel.value) return;
        const opt = field.prewritten_options.find(o => o.label === sel.value);
        if (opt) {
          paraTa.value = opt.text;
          _state[field.id].paragraphValue = opt.text;
        }
        sel.value = '';
      });
    }
  }

  // CIM-10 autocomplete widget
  if (field.icd_lookup) {
    const autocompleteInput = block.querySelector('.icd-autocomplete-input');
    const dropdown          = block.querySelector('.icd-autocomplete-dropdown');
    const status            = block.querySelector('.icd-widget__status');
    const detailToggle      = block.querySelector('.icd-detail-toggle');

    let _debounce = null;

    const showDropdown = items => {
      if (!items.length) { dropdown.hidden = true; return; }
      dropdown.innerHTML = items.map(r =>
        `<div class="icd-autocomplete-item" tabindex="-1"
              data-uri="${_escHtml(r.uri)}"
              data-code="${_escHtml(r.code)}"
              data-label="${_escHtml(r.label)}">
          <span class="icd-autocomplete-code">${_escHtml(r.code)}</span>
          <span class="icd-autocomplete-label">${_escHtml(_stripCodePrefix(r.label, r.code))}</span>
        </div>`
      ).join('');
      dropdown.hidden = false;
    };

    const selectItem = async (uri, code, label) => {
      autocompleteInput.value = code;
      dropdown.hidden = true;
      status.className = 'icd-widget__status';
      status.textContent = 'Chargement...';

      if (!icdClient.isConfigured()) {
        const cleanTitle = label.startsWith(code + ' - ') ? label.slice(code.length + 3) : label;
        const fakeResult = { title: cleanTitle, description: '', inclusions: [], code, version: 'CIM-10' };
        paraTa.value = formatICDTitle(fakeResult);
        _state[field.id].paragraphValue = paraTa.value;
        _state[field.id].icdRaw = undefined;
        _handleToggle(field.id, 'paragraph', block);
        status.textContent = `✓ ${cleanTitle}`;
        status.className = 'icd-widget__status icd-widget__status--success';
        return;
      }

      const result = await icdClient.lookup(uri);
      if (!result) {
        // Fallback: use CSV label without description
        const cleanTitle = label.startsWith(code + ' - ') ? label.slice(code.length + 3) : label;
        const fakeResult = { title: cleanTitle, description: '', inclusions: [], code, version: 'CIM-10' };
        paraTa.value = formatICDTitle(fakeResult);
        _state[field.id].paragraphValue = paraTa.value;
        _state[field.id].icdRaw = undefined;
        _handleToggle(field.id, 'paragraph', block);
        status.textContent = `✓ ${cleanTitle}`;
        status.className = 'icd-widget__status icd-widget__status--success';
        return;
      }

      paraTa.value = formatICDTitle(result);
      _state[field.id].paragraphValue = formatICDTitle(result);
      _state[field.id].icdRaw = detailToggle?.checked ? formatICDDescription(result) : undefined;
      _handleToggle(field.id, 'paragraph', block);
      status.textContent = `✓ ${result.title}`;
      status.className = 'icd-widget__status icd-widget__status--success';
    };

    autocompleteInput.addEventListener('input', () => {
      clearTimeout(_debounce);
      const q = autocompleteInput.value.trim();
      if (q.length < 2) { dropdown.hidden = true; return; }
      _debounce = setTimeout(async () => {
        const results = await icdClient.search(q);
        showDropdown(results);
      }, 200);
    });

    // mousedown fires before blur — prevent blur from closing before click registers
    dropdown.addEventListener('mousedown', e => {
      e.preventDefault();
      const item = e.target.closest('.icd-autocomplete-item');
      if (item) selectItem(item.dataset.uri, item.dataset.code, item.dataset.label);
    });

    autocompleteInput.addEventListener('blur', () => {
      setTimeout(() => { dropdown.hidden = true; }, 150);
    });

    autocompleteInput.addEventListener('keydown', e => {
      if (e.key === 'Escape') { dropdown.hidden = true; return; }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        dropdown.querySelector('.icd-autocomplete-item')?.focus();
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = dropdown.querySelector('.icd-autocomplete-item');
        if (first) selectItem(first.dataset.uri, first.dataset.code, first.dataset.label);
      }
    });

    dropdown.addEventListener('keydown', e => {
      const items = [...dropdown.querySelectorAll('.icd-autocomplete-item')];
      const idx   = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown')  { e.preventDefault(); items[idx + 1]?.focus(); }
      if (e.key === 'ArrowUp')    { e.preventDefault(); idx <= 0 ? autocompleteInput.focus() : items[idx - 1]?.focus(); }
      if (e.key === 'Enter')      { e.preventDefault(); if (idx >= 0) selectItem(items[idx].dataset.uri, items[idx].dataset.code, items[idx].dataset.label); }
      if (e.key === 'Escape')     { dropdown.hidden = true; autocompleteInput.focus(); }
    });
  }

  // ICD lookup in notes panel — appends formatted result to notes textarea
  if (field.icd_lookup_notes) {
    const notesBtn    = block.querySelector('.icd-notes-btn');
    const notesInp    = block.querySelector('.icd-notes-input');
    const notesStatus = block.querySelector('.icd-notes-status');

    if (notesBtn && notesInp) {
      const doNotesLookup = async () => {
        const code = notesInp.value.trim();
        if (!code) return;
        if (!icdClient.isConfigured()) {
          notesStatus.textContent = 'API ICD non configurée (voir Paramètres)';
          notesStatus.className = 'icd-widget__status icd-widget__status--error';
          return;
        }
        notesBtn.disabled = true;
        notesStatus.textContent = 'Recherche en cours...';
        notesStatus.className = 'icd-widget__status';

        const result = await icdClient.lookup(code);
        notesBtn.disabled = false;

        if (!result) {
          notesStatus.textContent = `Code « ${code} » non trouvé`;
          notesStatus.className = 'icd-widget__status icd-widget__status--error';
          return;
        }

        const text = formatICDResult(result);
        const sep = notesTa.value.trim() ? '\n\n' : '';
        notesTa.value = notesTa.value.trimEnd() + sep + text;
        _state[field.id].notesValue = notesTa.value;
        notesStatus.textContent = `✓ ${result.title}`;
        notesStatus.className = 'icd-widget__status icd-widget__status--success';
        notesInp.value = '';
      };

      notesBtn.addEventListener('click', doNotesLookup);
      notesInp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doNotesLookup(); } });
    }
  }

  return block;
}

function _renderParagraphPanel(field) {
  let html = '';

  if (field.icd_lookup) {
    html += `
      <div class="icd-widget">
        <div class="icd-widget__label">Recherche CIM-10</div>
        <div class="icd-autocomplete-wrap">
          <input class="icd-autocomplete-input" type="text" autocomplete="off"
                 placeholder="Code (F43.22) ou mots-clés (anxiété, dépression...)">
          <div class="icd-autocomplete-dropdown" hidden></div>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
          <span class="icd-widget__status"></span>
          <label style="display:flex;align-items:center;gap:var(--space-2);font-size:var(--font-size-sm);color:var(--color-text-muted);cursor:pointer;margin-left:auto">
            <input type="checkbox" class="icd-detail-toggle" checked style="cursor:pointer">
            Ajouter la description détaillée en fin de rapport
          </label>
        </div>
      </div>`;
  }

  if (field.prewritten_options?.length) {
    const opts = field.prewritten_options.map(o =>
      `<option value="${_escHtml(o.label)}">${_escHtml(o.label)}</option>`
    ).join('');
    html += `
      <div class="prewritten-select-row">
        <label>Texte prédéfini :</label>
        <select class="prewritten-select">
          <option value="">— choisir —</option>
          ${opts}
        </select>
      </div>`;
  }

  html += `<textarea class="field-textarea" rows="4" placeholder="${_escHtml(field.notes_placeholder || '')}"></textarea>`;
  return html;
}

function _renderNotesPanel(field) {
  let html = '';
  if (field.icd_lookup_notes) {
    html += `
      <div class="icd-widget">
        <div class="icd-widget__label">Diagnostic ICD — ajouter aux notes</div>
        <div class="icd-widget__row">
          <input class="icd-widget__input icd-notes-input" type="text" placeholder="ex: F43.22" maxlength="20">
          <button class="btn btn-sm btn-secondary icd-widget__btn icd-notes-btn" type="button">Ajouter</button>
          <span class="icd-widget__status icd-notes-status"></span>
        </div>
      </div>`;
  }
  return html + `<textarea class="field-textarea field-textarea--notes" rows="5" placeholder="${_escHtml(field.notes_placeholder || 'Saisir vos notes...')}"></textarea>`;
}

function _handleToggle(fieldId, newMode, block) {
  _state[fieldId].mode = newMode;

  block.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.mode === newMode);
  });
  block.querySelectorAll('.field-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.panel === newMode);
  });
}

/* ── Arrêt de travail widget ────────────────────────────── */
function _renderArretWidget(field) {
  const s        = _state[field.id];
  const noneText = field.prewritten_none || 'Aucun arrêt de travail prescrit.';
  const isPrescrit = !!s.arretPrescrit;

  const block = document.createElement('div');
  block.className = 'field-block';
  block.id = `field-${field.id}`;

  block.innerHTML = `
    <div class="field-block__header">
      <div class="field-block__label">${_escHtml(field.label)}</div>
      <div class="toggle-group" role="group" aria-label="Arrêt de travail">
        <button class="toggle-btn arret-toggle ${!isPrescrit ? 'active' : ''}" data-arret="none" aria-pressed="${!isPrescrit}">Aucun</button>
        <button class="toggle-btn arret-toggle ${isPrescrit  ? 'active' : ''}" data-arret="prescribed" aria-pressed="${isPrescrit}">Prescrit</button>
      </div>
    </div>
    <div class="field-block__body">
      <div class="arret-fields" style="${isPrescrit ? '' : 'display:none'}">
        <div style="display:flex;align-items:center;gap:var(--space-3);margin-bottom:var(--space-3)">
          <label class="input-label" style="min-width:180px;margin:0">% d'arrêt</label>
          <input type="number" class="input arret-pct-stop" min="0" max="100" placeholder="100" style="width:90px">
          <span style="color:var(--color-text-muted);font-size:var(--font-size-sm)">%</span>
        </div>
        <div style="display:flex;align-items:center;gap:var(--space-3)">
          <label class="input-label" style="min-width:180px;margin:0">% d'activité initiale</label>
          <input type="number" class="input arret-pct-activity" min="0" max="100" placeholder="100" style="width:90px">
          <span style="color:var(--color-text-muted);font-size:var(--font-size-sm)">%</span>
        </div>
      </div>
    </div>`;

  const updateValue = () => {
    if (!_state[field.id].arretPrescrit) {
      _state[field.id].paragraphValue = noneText;
    } else {
      const pctStop     = block.querySelector('.arret-pct-stop').value     || '?';
      const pctActivity = block.querySelector('.arret-pct-activity').value || '?';
      _state[field.id].paragraphValue = `Arrêt de travail à ${pctStop}% sur une activité de ${pctActivity}%.`;
    }
  };

  block.querySelectorAll('.arret-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const prescribed = btn.dataset.arret === 'prescribed';
      _state[field.id].arretPrescrit = prescribed;
      block.querySelectorAll('.arret-toggle').forEach(b => {
        const active = (b.dataset.arret === 'prescribed') === prescribed;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
      block.querySelector('.arret-fields').style.display = prescribed ? '' : 'none';
      updateValue();
    });
  });

  block.querySelector('.arret-pct-stop').addEventListener('input', updateValue);
  block.querySelector('.arret-pct-activity').addEventListener('input', updateValue);

  return block;
}

/** Strip "F43.22 - " code prefix from a label for cleaner dropdown display. */
function _stripCodePrefix(label, code) {
  const prefix = code + ' - ';
  return label.startsWith(prefix) ? label.slice(prefix.length) : label;
}

function _escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
