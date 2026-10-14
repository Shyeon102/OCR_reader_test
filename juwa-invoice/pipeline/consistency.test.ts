import assert from "node:assert/strict";
import test from "node:test";
import type { InvoiceData } from "../shared/schema";
import { checkConsistency } from "./consistency";

const invoice: InvoiceData = {
  supplier_name: null, invoice_date: null, invoice_number: null,
  items: [{ description: "A", quantity: 2, unit_price: 50, total: 100 }],
  taxes: [{ rate: 20, taxable_base: 100, amount: 20 }],
  total_ht: 100, total_ttc: 120,
};

test("valid totals, multiple rates, zero VAT and explicit exemption", () => {
  assert.deepEqual(checkConsistency(invoice), []);
  assert.deepEqual(checkConsistency({ ...invoice, taxes: [
    { rate: 20, taxable_base: 50, amount: 10 },
    { rate: 10, taxable_base: 50, amount: 5 },
  ], total_ttc: 115 }), []);
  assert.deepEqual(checkConsistency({ ...invoice, taxes: [{ rate: 0, taxable_base: 100, amount: 0 }], total_ttc: 100 }), []);
  assert.deepEqual(checkConsistency({ ...invoice, taxes: [], total_ttc: 100 }), []);
});

test("reports all three mismatches without changing input", () => {
  const input = { ...invoice, total_ht: 90, total_ttc: 125,
    taxes: [{ rate: 20, taxable_base: 100, amount: 19 }] };
  const before = structuredClone(input);
  const warnings = checkConsistency(input);
  assert.deepEqual(warnings.map(w => w.field), ["total_ht", "taxes[0].amount", "total_ttc"]);
  assert.ok(warnings.every(w => w.code === "consistency_mismatch"));
  assert.deepEqual(input, before);
});

test("missing values skip affected checks, never use partial sums", () => {
  const warnings = checkConsistency({ ...invoice,
    items: [...invoice.items!, { description: null, quantity: null, unit_price: 10, total: null }],
    taxes: [{ rate: 20, taxable_base: 100, amount: 20 }, { rate: null, taxable_base: null, amount: null }],
  });
  assert.deepEqual(warnings.map(w => w.field), ["items[1].total", "total_ht", "taxes[1].amount", "total_ttc"]);
  assert.ok(warnings.every(w => w.code === "check_skipped"));
  assert.ok(checkConsistency({ ...invoice, items: null, taxes: null, total_ht: null, total_ttc: null })
    .every(w => w.code === "check_skipped"));
  assert.equal(checkConsistency({ ...invoice, taxes: [{ rate: null, taxable_base: null, amount: 20 }] }).length, 1);
});

test("one cent is tolerated, two cents warn; rounds fractional cents", () => {
  assert.deepEqual(checkConsistency({ ...invoice, total_ttc: 120.01 }), []);
  assert.equal(checkConsistency({ ...invoice, total_ttc: 120.02 })[0]?.field, "total_ttc");
  assert.deepEqual(checkConsistency({ ...invoice,
    items: [{ description: null, quantity: 1, unit_price: 1.005, total: 1.01 }],
    total_ht: 1.01, taxes: [], total_ttc: 1.01,
  }), []);
});


test("line total mismatch preserves the stated amount", () => {
  const input = { ...invoice, items: [{ description: "A", quantity: 2, unit_price: 50, total: 90 }] };
  const before = structuredClone(input);
  const warnings = checkConsistency(input);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].field, "items[0].total");
  assert.equal(warnings[0].code, "consistency_mismatch");
  assert.match(warnings[0].message, /calculated 100.00, stated 90.00/);
  assert.deepEqual(input, before);
});

test("line totals handle missing, zero and one-cent tolerance", () => {
  const lineWarnings = (quantity: number | null, unit_price: number | null, total: number | null) =>
    checkConsistency({ ...invoice, items: [{ description: null, quantity, unit_price, total }] })
      .filter(w => w.field === "items[0].total");
  for (const args of [[null, 50, 100], [2, null, 100], [2, 50, null]] as const) {
    assert.equal(lineWarnings(args[0], args[1], args[2])[0]?.code, "check_skipped");
  }
  assert.deepEqual(lineWarnings(0, 50, 0), []);
  assert.deepEqual(lineWarnings(2, 50, 100.01), []);
  assert.equal(lineWarnings(2, 50, 100.02)[0]?.code, "consistency_mismatch");
});
