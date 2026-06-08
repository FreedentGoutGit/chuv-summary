# MedReport

A privacy-first PWA for drafting structured medical reports in French, powered by an LLM of your choice.

All processing happens in the browser — no data leaves your device except the anonymised prompt sent to the LLM API.

## Features

- **Template-based forms** — fill structured sections (anamnèse, status psychique, diagnostic, médication, etc.) in either free-text or quick-notes mode.
- **CIM-10 autocomplete** — search by code (e.g. `F43.22`) or keywords (e.g. `anxiété dépression`). Works offline with the bundled `media/CIM-10.csv`. Optionally connects to the LIRMM BioPortal API for richer descriptions.
- **LLM generation** — sends the form contents to OpenAI, Anthropic, or Mistral to produce a polished clinical paragraph for each section.
- **Save & restore** — reports saved as `.txt`, drafts as `.json` using the File System Access API (with a download fallback for Firefox/Safari).
- **Installable PWA** — works offline after first load, can be added to the home screen.

## Quick start

Serve the repo root with any static server, e.g.:

```bash
npx serve .
# or
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser. On first launch a setup wizard will ask for:

1. **LLM provider & API key** — OpenAI, Anthropic, or Mistral.
2. **LIRMM BioPortal key** *(optional)* — enables full ICD descriptions. Get a free key at [bioportal.lirmm.fr](https://bioportal.lirmm.fr). Also requires deploying the Cloudflare Worker (see below).

## CIM-10 search

Autocomplete searches the bundled `media/CIM-10.csv` (CHU Rouen / LIRMM, ~14 000 entries) directly in the browser — no API key required. Selecting a code inserts it in the form as `Libellé [CIM-10 / F43.22]`.

If you configure the LIRMM key + Cloudflare Worker proxy, selecting a code will also fetch its full definition and inclusions, which are appended verbatim at the end of the generated report.

## Cloudflare Worker (optional)

The worker in `cloudflare-worker/icd-worker.js` proxies requests to the LIRMM BioPortal API to work around CORS restrictions.

```bash
wrangler deploy cloudflare-worker/icd-worker.js
```

Set the worker URL in Settings → URL proxy Cloudflare Worker.

## Project layout

```
index.html                  App shell
frontend/
  js/                       App logic (app, form-renderer, editor, settings, file-handler)
  css/                      Styles
api/
  icd-client.js             CIM-10 CSV search + LIRMM API lookup
  llm-client.js             LLM provider abstraction
  prompt-builder.js         Prompt assembly
templates/
  psychiatrie-urgence.json  Form template (extensible)
media/
  CIM-10.csv                Full CIM-10 classification (CHU Rouen / LIRMM)
cloudflare-worker/
  icd-worker.js             CORS proxy for LIRMM BioPortal
service-worker.js           PWA offline cache
```

## Privacy

- API keys are stored in `localStorage` only.
- No analytics, no telemetry, no server.
- Before each report generation, the app prompts you to confirm that no patient-identifying data (name, DOB, address, etc.) is present in the notes.
