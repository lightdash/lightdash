import type { z } from 'zod';

/**
 * A model-supplied argument that may be null or left out entirely; both parse
 * to null. Plain `.nullable()` keeps the key required, and models routinely
 * omit keys described as optional, which fails validation before the tool runs.
 */
export const optionalNull = <T extends z.ZodType>(schema: T) =>
    schema.nullish().default(null);
