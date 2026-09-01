import { z } from 'zod';

export const toJsonSchema = (
    schema: z.ZodType,
    io: 'input' | 'output' = 'output',
    reused: 'inline' | 'ref' = 'inline',
) =>
    z.toJSONSchema(schema, {
        target: 'draft-07',
        io,
        reused,
        cycles: 'throw',
    });
