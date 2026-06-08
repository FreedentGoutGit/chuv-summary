// Prompt Builder — assembles the LLM system prompt + user message.

// Hardcoded guardrails prepended to every call — never editable by the user.
const GENERAL_INSTRUCTIONS = `Tu es un assistant de rédaction médicale. Règles absolues :
- Tu ne poses aucun diagnostic. Tu reformules uniquement ce que le médecin a écrit.
- Tu n'inventes aucun symptôme, résultat ou observation clinique absent des notes.
- Style : phrases courtes, directes, denses. Pas de prose. Vocabulaire clinique précis.
- Supprime les tournures redondantes ; conserve l'intégralité de l'information clinique.
- Respecte la structure et l'ordre des sections tels que fournis.
- La langue de sortie est le français.`;

/**
 * Build the full prompt from a loaded template and current form values.
 *
 * @param {object} template     - The loaded JSON template object
 * @param {object} fieldValues  - { [fieldId]: { mode: 'paragraph'|'notes', value: string } }
 * @returns {{ systemPrompt: string, userMessage: string }}
 */
export function buildPrompt(template, fieldValues) {
  const systemPrompt = GENERAL_INSTRUCTIONS + '\n\n' + (template.system_prompt ?? '');

  const lines = [`TYPE DE RAPPORT : ${template.report_type}\n`];

  for (const field of template.fields) {
    const fv = fieldValues[field.id];
    if (!fv || !fv.value?.trim()) continue; // skip blank fields

    const tag   = fv.mode === 'paragraph' ? '[PARAGRAPHE]' : '[NOTES]';
    const label = field.label.toUpperCase();

    lines.push(`${tag} ${label} (niveau ${field.level}) :`);
    lines.push(fv.value.trim());

    if (field.llm_instruction) {
      lines.push(`(Instruction : ${field.llm_instruction})`);
    }

    lines.push(''); // blank line between fields
  }

  const userMessage = lines.join('\n');
  return { systemPrompt, userMessage };
}

/**
 * Format just the title + code of an ICD result (injected into paragraph for LLM).
 * Format: "Title [ICD-10 / F43.22]"
 */
export function formatICDTitle(icdResult) {
  if (!icdResult) return '';
  const version = icdResult.version || 'ICD';
  return `${icdResult.title} [${version} / ${icdResult.code}]`;
}

/**
 * Format the description + inclusions (appended untouched after the LLM output).
 */
export function formatICDDescription(icdResult) {
  if (!icdResult) return '';
  const parts = [];
  if (icdResult.description) parts.push(icdResult.description);
  if (icdResult.inclusions?.length) {
    parts.push('Inclusions : ' + icdResult.inclusions.join(', ') + '.');
  }
  return parts.join('\n');
}

/**
 * Format full ICD result (title + description + inclusions) — used for notes appends.
 */
export function formatICDResult(icdResult) {
  if (!icdResult) return '';
  return [formatICDTitle(icdResult), formatICDDescription(icdResult)]
    .filter(Boolean)
    .join('\n');
}
