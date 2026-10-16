# JUWA Invoice Extraction

TypeScript pipeline using Mistral OCR, structured LLM extraction, Zod validation and arithmetic checks. Results are local JSON files; no database is used. A single-page Next.js interface reads local results and displays invoice details, warnings and missing values.

## Running the project

Requires Node.js 22.19+, npm, and a Mistral account with OCR and chat-model access.
The application, pipeline, package manifest and lockfile all live in
`juwa-invoice/`. Install dependencies there only. The repository root contains
this README and Git configuration, not a separate npm project.

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

To process invoices and then start the review interface in one command:

```sh
npm run demo
# Optional input directory:
npm run demo -- /absolute/path/to/invoices
```

The script runs the pipeline first, then starts the development server. It also
starts the interface after a nonzero pipeline exit so available failure results
can be reviewed; a setup failure may leave only previous results. Open the local
URL printed by Next.js (normally http://localhost:3000). Press Ctrl+C to stop.
Every demo run processes invoices again and makes API calls. A running web server
does not mean the pipeline succeeded: check the pipeline summary and final JSON.
The demo command ultimately returns the web process exit status rather than
preserving the pipeline failure code. For a pipeline success/failure check, run
`npm run pipeline` separately.

PDFs are processed sequentially in filename order, without scanning subdirectories. Each run calls OCR and the LLM again. Outputs are created automatically:

- `output/ocr/<original-filename>.json`: intermediate OCR response and page metadata.
- `output/invoices/<original-filename>.json`: final fields, status, warnings and error.

Matching filenames are overwritten, including their warnings; other result files remain. One invoice's failure does not stop subsequent invoices. Setup, processing or save failures set a nonzero exit code; warnings alone do not. Inspect the final JSON's `warnings`: the CLI prints progress and errors, not all warnings.

```sh
npm test           # Local checks; no API calls
npm run typecheck
npm run lint
npm run build     # Production build check
npm run dev        # http://localhost:3000 — invoice review
```

Run these checks from `juwa-invoice/`. Tests, type checking, lint and build do not
call Mistral and do not require an API key. To verify a clean setup, clone the
repository into a new directory, run `npm ci` inside `juwa-invoice/`, then run the
checks above. Installed `node_modules/` folders are ignored by Git and must not be
committed. Configure `.env` and provide PDFs only when testing API extraction.

The review page reads `output/invoices/` on the server and validates each JSON file.
Select an invoice to view its items, VAT, totals and warnings. Click **Actualiser**
after running the pipeline to load current results. Missing values show **À vérifier**;
actual zeroes remain zero. Fields referenced by warnings are highlighted in amber,
with the warning explanation available on hover and in the warning list. The
interface uses a blue theme and adapts to smaller screens. Invalid result files appear as failures without hiding
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
| `pipeline/extract.ts` | Structured extraction, response validation and VAT base evidence checks |
| `shared/schema.ts` | Data, warnings, result schemas and inferred types |
| `pipeline/consistency.ts` | Arithmetic checks without changing extracted values |
| `pipeline/errors.ts` | Error formatting and configured API-key redaction |
| `scripts/demo.ts` | Run the pipeline, then start the web development server |
| `app/page.tsx` | Read and validate local results on the server |
| `app/components/invoice-review.tsx` | Invoice selection, details and field-level warnings |

The OCR model is `mistral-ocr-latest`; the chat model comes from `.env`.
Checks compare each quantity × unit price with its stated line total, the sum of calculated line amounts with HT, each VAT base × rate / 100 with its tax amount, and HT + tax amounts with TTC. They assume EUR, round to cents and tolerate a one-cent difference. Missing components skip the affected check rather than producing partial sums. The 12 automated tests cover consistency checks, missing values, multiple rates, rounding, input preservation, VAT evidence validation and invoice schema success/failure rules. Tests run locally without API calls; they do not establish LLM extraction accuracy.

VAT base verification runs after LLM response validation. The LLM supplies an
internal `taxable_base_evidence` quote. Code retains the base only when that quote
matches a single OCR line with a recognized base label, the extracted amount and
one matching VAT percentage. Unverified bases become `null`; a field warning is
added if absent. This internal evidence field is removed from the final JSON.
The LLM emits extraction warnings only; arithmetic warnings are generated by code.

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
- `success` means processing completed, not that every field is correct or every check passed. A readable non-invoice document can produce a successful result with every data field set to `null`; there is no document-type or minimum-information rule.

Warnings have `code`, `field` (relative to `data`, e.g. `items[0].total`) and `message`:

| Code | Source | Meaning |
| --- | --- | --- |
| `missing_field` | LLM | Field reported as absent |
| `unreadable_field` | LLM or code | Field reported as unreadable/uncertain, or VAT base evidence could not be verified |
| `consistency_mismatch` | Code | Arithmetic difference exceeds tolerance |
| `check_skipped` | Code | Required values are unavailable or cannot be calculated |

Extraction and arithmetic warnings are combined for the current run. An empty
OCR response fails before the LLM call. Other failures include API errors,
truncated/unparseable LLM output and schema violations. A nonempty OCR response
whose extracted fields are all null still passes the current schema. A processing failure is saved when possible as:

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
- **Incomplete warning guarantees:** extraction warnings mainly come from the LLM. Code ensures a warning for an unverified/null VAT base, but not for every other null field. Instructions prohibit guesses and unrelated warnings; compliance is not fully enforced in code.
- **Conservative VAT evidence:** HT is not used as an implicit tax base. Verification recognizes a limited set of French/English base labels and requires the base and rate on one line. Legitimate evidence split across lines, table headers or other layouts can be rejected. Other extracted fields have no equivalent evidence guard.
- **Processing status:** there is no invoice classification or minimum extracted-data requirement. Manual tests showed that a blank PDF fails on empty OCR, while a PDF containing only `A` can succeed with all fields null. Success therefore represents technical completion, not a usable invoice.
- **Limited accounting rules:** EUR and cent rounding are assumed. Discounts, withholding, special adjustments and other rounding methods are not modeled separately. Mismatches require review. An unknown VAT base skips the rate check, while the TTC check can still use available tax amounts.
- **Basic operations:** no application-level retry policy, parallel processing, OCR reuse, batch resume or run history. API quota and availability can cause failures. Temporary-upload deletion is attempted; cleanup errors are logged.
- **File-based storage:** matching filenames from different inputs overwrite results. Failed saves may leave older files, and raw OCR snapshots can outlive a failed rerun. Final JSON is the status record when successfully written.
- **Basic review UI:** results are read-only. There is no PDF upload, in-browser pipeline execution, PDF preview or editing. Traceability is limited to filenames and saved page-level OCR. Warning details retain the language of the pipeline output; the interface labels are French.

## Possible next steps: 4 to 4,000 invoices per month

I would introduce a job queue to absorb bursts and API latency, with retries and
resume for failed invoices, then tune bounded concurrency to measured throughput
and Mistral rate limits. OCR results could be cached by PDF content hash; extraction
caches would also include the OCR content, model, prompt and schema versions. I
would evaluate a cheaper, fixed model version against representative invoices
before changing models, and track cost, latency and extraction quality. For the
review interface, the first additions would be warning-type filters and search by
supplier, invoice number or filename. A later correction workflow would preserve
the original extraction, save a separate corrected JSON with an edit history, and
rerun validation and arithmetic checks. These are future plans, not implemented
features; concurrency would be justified by burst volume and processing targets,
not monthly volume alone.
