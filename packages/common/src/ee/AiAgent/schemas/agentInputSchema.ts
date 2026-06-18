import { jsonSchema, type Schema } from 'ai';
import { type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

export const createAgentInputSchema = <TInput extends z.ZodTypeAny>(
    inputSchema: TInput,
): Schema<z.infer<TInput>> => {
    const agentJsonSchema = zodToJsonSchema(inputSchema, {
        $refStrategy: 'root',
        target: 'jsonSchema7',
    }) as Schema<z.infer<TInput>>['jsonSchema'];

    return jsonSchema<z.infer<TInput>>(agentJsonSchema, {
        validate: (value) => {
            const result = inputSchema.safeParse(value);

            if (result.success) {
                return { success: true, value: result.data as z.infer<TInput> };
            }

            return { success: false, error: result.error };
        },
    });
};
