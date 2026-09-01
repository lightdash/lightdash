import { jsonSchema, type Schema } from 'ai';
import { z } from 'zod';

export const createAgentInputSchema = <T extends z.ZodType>(
    inputSchema: T,
): Schema<z.output<T>> =>
    jsonSchema<z.output<T>>(
        z.toJSONSchema(inputSchema, {
            target: 'draft-07',
            reused: 'ref',
            unrepresentable: 'any',
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
