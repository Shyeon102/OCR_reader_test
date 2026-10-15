# JUWA Invoice Extraction

TypeScript pipeline using Mistral OCR, structured LLM extraction, Zod validation and arithmetic checks. Results are local JSON files; no database is used. A single-page Next.js interface reads local results and displays invoice details, warnings and missing values.

## Running the project

Requires Node.js 22.19+, npm, and a Mistral account with OCR and chat-model access.
From the repository root:

```sh
cd juwa-invoice
npm ci
cp .env.example .env
```

If `.env` exists, edit it instead of overwriting it. Set these values and keep the key private:

```dotenv
MISTRAL_API_KEY=your-api-key
MISTRAL_LLM_MODEL=your-available-chat-model-id
```

Create `invoices/` if needed and place PDFs inside it. From `juwa-invoice/`, run:

```sh
npm run pipeline
# Or specify another input directory:
npm run pipeline -- /absolute/path/to/invoices
```

PDFs are processed sequentially in filename order, without scanning subdirectories. Each run calls OCR and the LLM again. Outputs are created automatically:

- `output/ocr/<original-filename>.json`: intermediate OCR response and page metadata.
- `output/invoices/<original-filename>.json`: final fields, status, warnings and error.

Matching filenames are overwritten, including their warnings; other result files remain. One invoice's failure does not stop subsequent invoices. Setup, processing or save failures set a nonzero exit code; warnings alone do not. Inspect the final JSON's `warnings`: the CLI prints progress and errors, not all warnings.

```sh
npm test           # Local checks; no API calls
npm run typecheck
npm run lint
npm run dev        # http://localhost:3000 — invoice review
```

The review page reads `output/invoices/` on the server and validates each JSON file.
Select an invoice to view its items, VAT, totals and warnings. Click **Actualiser**
after running the pipeline to load current results. Missing values show **À vérifier**;
actual zeroes remain zero. Invalid result files appear as failures without hiding
other invoices. An empty or absent output directory shows an empty state.

## Current implementation

```text
PDF → OCR → page-labelled Markdown → LLM → Zod validation
    → consistency warnings → final JSON
```

| File | Responsibility |
| --- | --- |
| `pipeline/index.ts` | Configuration, shared API client, file processing and result storage |
| `pipeline/ocr.ts` | PDF upload, OCR and temporary remote-file cleanup |
| `pipeline/extract.ts` | Structured field extraction and response validation |
| `shared/schema.ts` | Data, warnings, result schemas and inferred types |
| `pipeline/consistency.ts` | Arithmetic checks without changing extracted values |
| `pipeline/errors.ts` | Error formatting and configured API-key redaction |

The OCR model is `mistral-ocr-latest`; the chat model comes from `.env`.
Checks compare each quantity × unit price with its stated line total, the sum of calculated line amounts with HT, each VAT base × rate / 100 with its tax amount, and HT + tax amounts with TTC. They assume EUR, round to cents and tolerate a one-cent difference. Missing components skip the affected check rather than producing partial sums. Tests cover these checks, missing values, multiple rates, rounding and input preservation.

## JSON structure

Illustrative successful result:

```json
{
  "source_file": "example.pdf",
  "status": "success",
  "data": {
    "supplier_name": "Example Supplier",
    "invoice_date": "2026-10-08",
    "invoice_number": "FAC-001",
    "items": [
      { "description": "Product A", "quantity": 2, "unit_price": 25, "total": 50 }
    ],
    "taxes": [
      { "rate": 20, "taxable_base": 50, "amount": 10 }
    ],
    "total_ht": 50,
    "total_ttc": 60
  },
  "warnings": [],
  "error": null
}
```

- Fields are required; unavailable extraction values are `null`, not omitted or replaced by zero. `items` and `taxes` can also be `null`.
- Dates use `YYYY-MM-DD`. HT and item prices/totals exclude VAT; TTC includes VAT.
- Item `total` is the printed line amount, never calculated to fill a missing value.
- VAT `rate: 20` means 20%. `taxable_base` must be explicitly associated with that tax entry; it is not automatically replaced with HT. Explicit zeroes are preserved.
- The extraction instructions reserve `taxes: []` for explicitly absent applicable VAT entries; `null` means unknown.
- `success` means processing completed, not that every field is correct or every check passed.

Warnings have `code`, `field` (relative to `data`, e.g. `items[0].total`) and `message`:

| Code | Source | Meaning |
| --- | --- | --- |
| `missing_field` | LLM | Field reported as absent |
| `unreadable_field` | LLM | Field reported as unreadable or uncertain |
| `consistency_mismatch` | Code | Arithmetic difference exceeds tolerance |
| `check_skipped` | Code | Required values are unavailable or cannot be calculated |

Extraction and arithmetic warnings are combined for the current run. A processing failure is saved when possible as:

```json
{
  "source_file": "example.pdf",
  "status": "failure",
  "data": null,
  "warnings": [],
  "error": "[extract] LLM response parsing or schema validation failed."
}
```

## Known limitations

- **Variable extraction:** repeated OCR/LLM calls can change values and warnings, even at temperature zero. Schema validation and matching arithmetic do not prove accuracy or completeness. Compare results with the originals.
- **Incomplete warning guarantees:** missing/unreadable warnings come from the LLM. Code does not yet ensure every null field has a warning. The model may also infer values despite instructions; a local result used HT as a VAT base while admitting it was not explicit.
- **Limited accounting rules:** EUR and cent rounding are assumed. Discounts, withholding, special adjustments and other rounding methods are not modeled separately. Mismatches require review. An unknown VAT base skips the rate check, while the TTC check can still use available tax amounts.
- **Basic operations:** no application-level retry policy, parallel processing, OCR reuse, batch resume or run history. API quota and availability can cause failures. Temporary-upload deletion is attempted; cleanup errors are logged.
- **File-based storage:** matching filenames from different inputs overwrite results. Failed saves may leave older files, and raw OCR snapshots can outlive a failed rerun. Final JSON is the status record when successfully written.
- **Basic review UI:** results are read-only. There is no PDF upload, in-browser pipeline execution, PDF preview or editing. Traceability is limited to filenames and saved page-level OCR. Warning details retain the language of the pipeline output; the interface labels are French.
