import { Mistral } from "@mistralai/mistralai";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readInvoice } from "./ocr";
import { describeError } from "./errors";
import { extractInvoice } from "./extract";
import { checkConsistency } from "./consistency";
import { InvoiceSchema, type Invoice } from "../shared/schema";

async function main() {
  const inputDirectory = resolve(process.argv[2] ?? "invoices");
  const outputDirectory = resolve("output/invoices");
  const ocrDirectory = resolve("output/ocr");
  const entries = await readdir(inputDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  if (files.length === 0) {
    throw new Error(`No PDF files found in ${inputDirectory}.`);
  }

  const apiKey = process.env.MISTRAL_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Set MISTRAL_API_KEY in .env before running the pipeline.");
  }

  const model = process.env.MISTRAL_LLM_MODEL?.trim();
  if (!model) {
    throw new Error("Set MISTRAL_LLM_MODEL in .env before running the pipeline.");
  }

  const client = new Mistral({ apiKey });
  await mkdir(outputDirectory, { recursive: true });
  await mkdir(ocrDirectory, { recursive: true });
  let failed = 0;

  for (const fileName of files) {
    // Persist a failure too, so a failed rerun replaces an old successful result.
    let result: Invoice;
    let stage = "ocr";
    try {
      const ocr = await readInvoice(client, resolve(inputDirectory, fileName));
      stage = "save-ocr";
      await writeFile(
        resolve(ocrDirectory, `${fileName}.json`),
        JSON.stringify({ sourceFile: fileName, status: "success", ocr }, null, 2) + "\n",
      );

      stage = "extract";
      const markdown = ocr.pages
        .map((page) => `--- Page ${page.index + 1} ---\n${page.markdown}`)
        .join("\n\n");
      if (!ocr.pages.some((page) => page.markdown.trim())) {
        throw new Error("OCR returned no text to extract.");
      }
      console.log(`[extract] ${fileName}`);
      const extracted = await extractInvoice(client, model, markdown);

      stage = "consistency";
      const warnings = [...extracted.warnings, ...checkConsistency(extracted.data)];

      stage = "validate";
      result = InvoiceSchema.parse({
        source_file: fileName,
        status: "success",
        data: extracted.data,
        warnings,
        error: null,
      });
    } catch (error: unknown) {
      failed += 1;
      result = {
        source_file: fileName,
        status: "failure",
        data: null,
        warnings: [],
        error: `[${stage}] ${describeError(error)}`,
      };
      console.error(`Pipeline failed: ${fileName} — ${result.error}`);
    }

    try {
      await writeFile(
        resolve(outputDirectory, `${fileName}.json`),
        JSON.stringify(result, null, 2) + "\n",
      );
      console.log(`[saved:${result.status}] ${fileName}`);
    } catch (error: unknown) {
      if (result.status === "success") failed += 1;
      console.error(`Could not save invoice result: ${fileName} — ${describeError(error)}`);
    }
  }

  console.log(`Finished: ${files.length - failed} succeeded, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
