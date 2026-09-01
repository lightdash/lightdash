import { z } from 'zod';

type JsonSchemaOptions = {
    io: 'input' | 'output';
    reused?: 'inline' | 'ref';
};

export const toJsonSchema = (
    schema: z.ZodType,
    { io, reused = 'inline' }: JsonSchemaOptions,
) =>
    z.toJSONSchema(schema, {
        target: 'draft-07',
        io,
        reused,
        cycles: 'throw',
    });
