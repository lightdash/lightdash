import { jsonSchema, type Schema } from 'ai';
import type { JSONSchema7 } from 'json-schema';
import { type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const createAgentInputSchema = <TOutput, TInput>(
    inputSchema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
): Schema<TOutput> =>
    jsonSchema<TOutput>(
        zodToJsonSchema(inputSchema, {
            $refStrategy: 'root',
            target: 'jsonSchema7',
        }) as unknown as JSONSchema7, // FIXME: upstream type mismatch (zod-to-json-schema JsonSchema7Type vs json-schema JSONSchema7)
        {
            validate: (value) => {
                const result = inputSchema.safeParse(value);

                if (result.success) {
                    return { success: true, value: result.data };
                }

                return { success: false, error: result.error };
            },
        },
    );
