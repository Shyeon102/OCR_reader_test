import type { InvoiceData, InvoiceWarning } from "../shared/schema";

// EUR: round to cents, allowing a one-cent difference.
const cents = (value: number) =>
  Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100);

export function checkConsistency(data: InvoiceData): InvoiceWarning[] {
  const warnings: InvoiceWarning[] = [];

  function compare(field: string, label: string, expected: number | null, actual: number | null) {
    if (expected === null || actual === null || !Number.isFinite(expected) || !Number.isFinite(actual)) {
      warnings.push({ code: "check_skipped", field, message: `${label}: required values are missing or cannot be calculated.` });
      return;
    }
    const difference = cents(actual) - cents(expected);
    if (Math.abs(difference) > 1) {
      warnings.push({
        code: "consistency_mismatch",
        field,
        message: `${label}: calculated ${(cents(expected) / 100).toFixed(2)}, stated ${(cents(actual) / 100).toFixed(2)}, difference ${(difference / 100).toFixed(2)} EUR.`,
      });
    }
  }

  data.items?.forEach((item, index) => {
    const expected = item.quantity === null || item.unit_price === null
      ? null : item.quantity * item.unit_price;
    compare(`items[${index}].total`, "Quantity × unit price vs line total", expected, item.total);
  });

  // Never compare a partial sum when a line is unreadable.
  const itemsTotal = data.items?.length
    ? data.items.reduce<number | null>((sum, item) =>
        sum === null || item.quantity === null || item.unit_price === null
          ? null : sum + cents(item.quantity * item.unit_price) / 100, 0)
    : null;
  compare("total_ht", "Item sum vs HT", itemsTotal, data.total_ht);

  if (data.taxes === null) {
    warnings.push({ code: "check_skipped", field: "taxes", message: "VAT checks skipped: tax breakdown is unavailable." });
  } else {
    data.taxes.forEach((tax, index) => {
      const expected = tax.taxable_base === null || tax.rate === null
        ? null : tax.taxable_base * tax.rate / 100;
      compare(`taxes[${index}].amount`, "VAT base × rate", expected, tax.amount);
    });
  }

  // An explicit empty tax list means no applicable VAT; null means unknown.
  const taxTotal = data.taxes === null ? null
    : data.taxes.reduce<number | null>((sum, tax) =>
        sum === null || tax.amount === null ? null : sum + tax.amount, 0);
  const expectedTtc = data.total_ht === null || taxTotal === null
    ? null : data.total_ht + taxTotal;
  compare("total_ttc", "HT + VAT vs TTC", expectedTtc, data.total_ttc);

  return warnings;
}
