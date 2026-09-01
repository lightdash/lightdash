import { jsonSchema, type Schema } from 'ai';
import { type z } from 'zod';
import { toLlmJsonSchema } from '../../../utils/zodJsonSchema';

export const createAgentInputSchema = <TSchema extends z.ZodType>(
    inputSchema: TSchema,
): Schema<z.output<TSchema>> =>
    jsonSchema<z.output<TSchema>>(
        toLlmJsonSchema(inputSchema, { reused: 'ref' }),
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
