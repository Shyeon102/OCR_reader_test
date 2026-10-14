import { Mistral } from "@mistralai/mistralai";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { describeError } from "./errors";

export async function readInvoice(client: Mistral, filePath: string) {
  console.log(`[upload] ${basename(filePath)}`);
  const uploadedPdf = await client.files.upload({
    file: {
      fileName: basename(filePath),
      content: await readFile(filePath),
    },
    purpose: "ocr",
  });

  try {
    console.log(`[ocr] ${basename(filePath)}`);
    return await client.ocr.process({
      model: "mistral-ocr-latest",
      document: { type: "file", fileId: uploadedPdf.id },
      includeImageBase64: false,
    });
  } finally {
    // Remove only the temporary file created by this call.
    // Cleanup failure must not hide an OCR result or the original error.
    await client.files.delete({ fileId: uploadedPdf.id }).catch((error: unknown) => {
      console.warn(`[cleanup] ${basename(filePath)} — ${describeError(error)}`);
    });
  }
}
