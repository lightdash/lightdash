import { jsonSchema, type Schema } from 'ai';
import { z } from 'zod';
import { draft7JsonSchemaOptions } from '../../../utils/zodJsonSchema';

export const createAgentInputSchema = <T extends z.ZodType>(
    inputSchema: T,
): Schema<z.output<T>> =>
    jsonSchema<z.output<T>>(
        z.toJSONSchema(inputSchema, draft7JsonSchemaOptions('ref')),
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
