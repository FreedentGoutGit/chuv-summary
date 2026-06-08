// LLM Client — unified abstraction for OpenAI, Anthropic, Mistral
// All providers support direct browser CORS calls.

export const MODELS = {
  openai:    ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  mistral:   ['mistral-large-latest', 'mistral-medium-latest', 'mistral-small-latest'],
};

const ENDPOINTS = {
  openai:    'https://api.openai.com/v1/chat/completions',
  anthropic: 'https://api.anthropic.com/v1/messages',
  mistral:   'https://api.mistral.ai/v1/chat/completions',
};

let _provider = null;
let _apiKey   = null;
let _model    = null;

export function setProvider(provider, apiKey, model) {
  _provider = provider;
  _apiKey   = apiKey;
  _model    = model || MODELS[provider]?.[0];
}

export function getProvider()   { return _provider; }
export function getModel()      { return _model; }
export function getModels(p)    { return MODELS[p] || []; }
export function isConfigured()  { return !!(_provider && _apiKey && _model); }

export async function complete(systemPrompt, userMessage) {
  if (!isConfigured()) throw new LLMError('not_configured', 'LLM non configuré. Ouvrez les paramètres.', _provider);

  switch (_provider) {
    case 'openai':    return _callOpenAI(systemPrompt, userMessage);
    case 'anthropic': return _callAnthropic(systemPrompt, userMessage);
    case 'mistral':   return _callMistral(systemPrompt, userMessage);
    default:          throw new LLMError('unknown_provider', `Fournisseur inconnu : ${_provider}`, _provider);
  }
}

async function _callOpenAI(systemPrompt, userMessage) {
  const res = await fetch(ENDPOINTS.openai, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_apiKey}`,
    },
    body: JSON.stringify({
      model: _model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.3,
    }),
  });
  const data = await _parseResponse(res, 'openai');
  return data.choices[0].message.content;
}

async function _callAnthropic(systemPrompt, userMessage) {
  const res = await fetch(ENDPOINTS.anthropic, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': _apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: _model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 4096,
      temperature: 0.3,
    }),
  });
  const data = await _parseResponse(res, 'anthropic');
  return data.content[0].text;
}

async function _callMistral(systemPrompt, userMessage) {
  const res = await fetch(ENDPOINTS.mistral, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${_apiKey}`,
    },
    body: JSON.stringify({
      model: _model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage },
      ],
      temperature: 0.3,
    }),
  });
  const data = await _parseResponse(res, 'mistral');
  return data.choices[0].message.content;
}

async function _parseResponse(res, provider) {
  let data;
  try {
    data = await res.json();
  } catch {
    throw new LLMError('parse_error', 'Réponse invalide du serveur.', provider);
  }
  if (!res.ok) {
    if (res.status === 529 || res.status === 503) {
      throw new LLMError('overloaded', 'Les serveurs sont surchargés. Veuillez réessayer dans quelques instants.', provider);
    }
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new LLMError('api_error', msg, provider);
  }
  return data;
}

export class LLMError extends Error {
  constructor(code, message, provider) {
    super(message);
    this.code     = code;
    this.provider = provider;
    this.name     = 'LLMError';
  }
}
