import { z } from 'zod';

// Preserve minute-precision datetimes accepted before Zod 4.5.
export const isoDateTimeStringSchema = z.union([
    z.string().datetime(),
    z.string().datetime({ precision: -1 }),
]);

export const isoDateTimeWithOffsetStringSchema = z.union([
    z.string().datetime({ offset: true }),
    z.string().datetime({ offset: true, precision: -1 }),
]);
