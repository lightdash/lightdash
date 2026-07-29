import { jsonSchema, type Schema } from 'ai';
import { type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const createAgentInputSchema = <TOutput, TInput>(
    inputSchema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
): Schema<TOutput> =>
    jsonSchema<TOutput>(
        zodToJsonSchema(inputSchema, {
            $refStrategy: 'root',
            target: 'jsonSchema7',
        }),
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
