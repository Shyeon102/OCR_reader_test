import assert from "node:assert/strict";
import test from "node:test";
import { InvoiceDataSchema, InvoiceSchema, WarningSchema } from "./schema";

const data = {
  supplier_name: "Example Supplier", invoice_date: "2026-10-08", invoice_number: "FAC-001",
  items: [{ description: "Product A", quantity: 2, unit_price: 25, total: 50 }],
  taxes: [{ rate: 20, taxable_base: 50, amount: 10 }],
  total_ht: 50, total_ttc: 60,
};
const result = { source_file: "example.pdf", status: "success", data, warnings: [], error: null };

test("accepts complete invoice data", () => {
  assert.equal(InvoiceDataSchema.safeParse(data).success, true);
  assert.equal(InvoiceSchema.safeParse(result).success, true);
});

test("allows null values but requires every extraction key", () => {
  const unknown = Object.fromEntries(Object.keys(data).map(key => [key, null]));
  assert.equal(InvoiceDataSchema.safeParse(unknown).success, true);
  for (const key of Object.keys(data)) {
    const incomplete = { ...unknown };
    delete incomplete[key];
    assert.equal(InvoiceDataSchema.safeParse(incomplete).success, false, key);
  }
  const item = { description: null, quantity: null, unit_price: null, total: null };
  const tax = { rate: null, taxable_base: null, amount: null };
  assert.equal(InvoiceDataSchema.safeParse({ ...data, items: [item], taxes: [tax] }).success, true);
  const incompleteItem = Object.fromEntries(Object.entries(item).filter(([key]) => key !== "total"));
  const incompleteTax = Object.fromEntries(Object.entries(tax).filter(([key]) => key !== "taxable_base"));
  assert.equal(InvoiceDataSchema.safeParse({ ...data, items: [incompleteItem] }).success, false);
  assert.equal(InvoiceDataSchema.safeParse({ ...data, taxes: [incompleteTax] }).success, false);
});

test("rejects incorrect numeric types, invalid dates and unknown warning codes", () => {
  assert.equal(InvoiceDataSchema.safeParse({ ...data, total_ht: "50,00" }).success, false);
  assert.equal(InvoiceDataSchema.safeParse({ ...data, items: [{ ...data.items[0], quantity: "2" }] }).success, false);
  for (const invoice_date of ["08/10/2026", "2026-02-30"]) {
    assert.equal(InvoiceDataSchema.safeParse({ ...data, invoice_date }).success, false);
  }
  assert.equal(WarningSchema.safeParse({ code: "arithmetic_mismatch", field: "items[0].total", message: "Mismatch" }).success, false);
});

test("enforces success and failure result structures", () => {
  const failure = { ...result, status: "failure", data: null, error: "OCR failed" };
  assert.equal(InvoiceSchema.safeParse(failure).success, true);
  for (const invalid of [
    { ...result, data: null },
    { ...result, error: "Unexpected error" },
    { ...failure, data },
    { ...failure, error: null },
    { ...failure, error: "" },
    { ...failure, error: undefined },
    { ...result, status: "pending" },
  ]) {
    assert.equal(InvoiceSchema.safeParse(invalid).success, false);
  }
});
