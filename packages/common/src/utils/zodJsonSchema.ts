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
        override: ({ zodSchema, jsonSchema }) => {
            if (io === 'input' && zodSchema instanceof z.ZodObject) {
                // Keep tool contracts closed unless the object has an explicit
                // catchall, and match requiredness to runtime undefined handling.
                if (jsonSchema.additionalProperties === undefined) {
                    Object.assign(jsonSchema, { additionalProperties: false });
                }

                const shape = zodSchema.shape as Record<string, z.ZodType>;
                const required = Object.entries(shape)
                    .filter(
                        ([, propertySchema]) => !propertySchema.isOptional(),
                    )
                    .map(([propertyName]) => propertyName);

                if (required.length > 0) {
                    Object.assign(jsonSchema, { required });
                }
            }
        },
    });
