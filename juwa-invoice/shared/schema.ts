import { z } from 'zod';

export const InvoiceDataSchema = z.object({
    supplier_name: z.string().nullable(),
    invoice_date: z.iso.date().nullable(),
    invoice_number: z.string().nullable(),
    items: z.array(z.object({
        description: z.string().nullable(),
        quantity: z.number().nullable(),
        unit_price: z.number().nullable(),
    })).nullable(),
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