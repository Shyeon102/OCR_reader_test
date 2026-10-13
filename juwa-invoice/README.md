# JUWA Invoice Extraction

TypeScript pipeline and Next.js TypeScript interface, without a database.

## Setup

Requires Node.js 22.19 or newer. Run these commands from `juwa-invoice/`:

```sh
npm ci
cp .env.example .env
```

Set `MISTRAL_API_KEY` and `MISTRAL_LLM_MODEL` (your chosen Mistral chat model)
in `.env`. Both are checked before OCR begins. Never commit the key.
Place invoice PDFs in `invoices/`, then run:

```sh
npm run pipeline
```

To process another directory:

```sh
npm run pipeline -- /absolute/path/to/invoices
```

The pipeline uploads each PDF to Mistral, calls `mistral-ocr-latest`, and saves
page-level OCR responses to `output/ocr/<original-filename>.json`, including
the original filename. PDFs are processed sequentially. A failed PDF gets an
error result and does not stop the remaining files. Any failure sets a nonzero
exit code. Re-running overwrites results for the same filenames. Temporary
Mistral uploads are deleted after processing; a cleanup failure logs a warning.
After OCR, page-labelled Markdown is sent to the selected LLM for invoice field
extraction. Its structured response is validated with Zod, then saved with source
filename, status, warnings and error to `output/invoices/<original-filename>.json`.
Failed processing also overwrites the final invoice result with a failure record.
Raw OCR files are intermediate snapshots, not the final processing status.
Generated OCR and invoice results are ignored by Git.

## Current scope

OCR, LLM field extraction and schema validation are connected.
Business consistency checks and the results interface are not implemented yet.
The web page currently remains the Next.js starter screen.

## Web and checks

```sh
npm run dev
npm run typecheck
npm run lint
```

Open http://localhost:3000 for the web interface.
