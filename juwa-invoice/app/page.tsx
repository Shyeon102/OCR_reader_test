import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { connection } from "next/server";
import { InvoiceSchema, type Invoice } from "../shared/schema";
import InvoiceReview from "./components/invoice-review";

export default async function Home() {
  await connection();
  const directory = join(process.cwd(), "output/invoices");
  let files: string[];
  try {
    files = (await readdir(directory)).filter(name => name.endsWith(".json")).sort();
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
    files = [];
  }
  const invoices: Invoice[] = await Promise.all(files.map(async name => {
    try {
      return InvoiceSchema.parse(JSON.parse(await readFile(join(directory, name), "utf8")));
    } catch {
      return {
        source_file: name, status: "failure" as const, data: null, warnings: [],
        error: "Résultat illisible ou incompatible. Relancez le traitement de cette facture.",
      };
    }
  }));
  return <InvoiceReview invoices={invoices} />;
}
