import { jsonSchema, type Schema } from 'ai';
import { type z } from 'zod';
import { toJsonSchema } from '../../../utils/zodJsonSchema';

export const createAgentInputSchema = <TSchema extends z.ZodType>(
    inputSchema: TSchema,
): Schema<z.output<TSchema>> =>
    jsonSchema<z.output<TSchema>>(toJsonSchema(inputSchema, 'input', 'ref'), {
        validate: (value) => {
            const result = inputSchema.safeParse(value);

            if (result.success) {
                return { success: true, value: result.data };
            }

            return { success: false, error: result.error };
        },
    });
