import { z } from 'zod';

export const InvoiceDataSchema = z.object({
    supplier_name: z.string().nullable(),
    invoice_date: z.iso.date().nullable(),
    invoice_number: z.string().nullable(),
    items: z.array(z.object({
        description: z.string().nullable(),
        quantity: z.number().nullable(),
        unit_price: z.number().nullable(),
        total: z.number().nullable().describe('Stated line total excluding VAT; null if missing or unreadable. Never calculate it.'),
    })).nullable(),
    taxes: z.array(z.object({
        rate: z.number().nullable().describe('VAT percentage as printed: 20 means 20%, not 0.20.'),
        taxable_base: z.number().nullable().describe('Explicitly stated taxable amount for this VAT entry; never calculated.'),
        amount: z.number().nullable().describe('Explicitly stated VAT amount; never calculated.'),
    })).nullable().describe('VAT breakdown entries; null when unavailable, [] only when the document explicitly has no applicable VAT entries.'),
    total_ht: z.number().nullable(),
    total_ttc: z.number().nullable(),
});

export const WarningSchema = z.object({
    code: z.enum([
        'unreadable_field',
        'missing_field',
        'consistency_mismatch',
        'check_skipped',
    ]),
    field: z.string(),
    message: z.string(),
});

export const InvoiceSchema = z.discriminatedUnion('status', [
    z.object({
        source_file: z.string(),
        status: z.literal('success'),
        data: InvoiceDataSchema,
        warnings: z.array(WarningSchema),
        error: z.null(),
    }),
    z.object({
        source_file: z.string(),
        status: z.literal('failure'),
        data: z.null(),
        warnings: z.array(WarningSchema),
        error: z.string().min(1),
    }),
]);

export type InvoiceData = z.infer<typeof InvoiceDataSchema>;
export type InvoiceWarning = z.infer<typeof WarningSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
