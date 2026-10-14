import assert from "node:assert/strict";
import test from "node:test";
import type { Mistral } from "@mistralai/mistralai";
import { extractInvoice } from "./extract";

async function extract(markdown: string, evidence: string | null, rate = 20) {
  const client = { chat: { parse: async () => ({ choices: [{ message: { parsed: {
    data: {
      supplier_name: null, invoice_date: null, invoice_number: null, items: null,
      total_ht: 3753, total_ttc: 4503.6,
      taxes: [{ rate, amount: 750.6, taxable_base: 3753, taxable_base_evidence: evidence }],
    }, warnings: [],
  } } }] }) } } as unknown as Mistral;
  return extractInvoice(client, "test", markdown);
}

test("rejects inferred HT base, invented evidence and incorrect rate", async () => {
  const printed = "TVA 20% — Base imposable : 3 753,00 €";
  for (const [ocr, evidence, rate] of [
    ["Total HT 3 753,00 €\nTVA 20% 750,60 €", "Total HT 3 753,00 €", 20],
    ["Total HT 3 753,00 €", printed, 20],
    [printed, printed, 10],
    [printed, null, 20],
    [printed + " TVA 10%", printed + " TVA 10%", 20],
  ] as const) {
    const result = await extract(ocr, evidence, rate);
    assert.equal(result.data.taxes?.[0].taxable_base, null);
    assert.ok(result.warnings.some(w => w.field === "taxes[0].taxable_base"));
    assert.equal(result.data.taxes?.[0].amount, 750.6);
  }
});

test("preserves an explicitly labelled base and removes internal evidence", async () => {
  const printed = "TVA 20% — Base imposable : 3 753,00 €";
  const result = await extract(printed, printed);
  assert.equal(result.data.taxes?.[0].taxable_base, 3753);
  assert.ok(!("taxable_base_evidence" in result.data.taxes![0]));
  assert.deepEqual(result.warnings, []);
});
