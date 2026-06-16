import { type z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
    type AgentInputSchema,
    type AgentToModelOutput,
    type McpErrorResult,
    type McpStructuredResult,
    type McpTextResult,
    type McpToolResultBuilders,
    type StandardAgentToolOutput,
    type ToolDescription,
    type ToolRuntime,
} from './defineTool';

const aiSchemaSymbol = Symbol.for('vercel.ai.schema');

export const resolveDescription = (
    description: ToolDescription,
    runtimeName: string,
): string =>
    typeof description === 'function' ? description(runtimeName) : description;

export const assertAvailable = (
    name: string,
    availability: readonly ToolRuntime[],
    runtime: ToolRuntime,
): void => {
    if (!availability.includes(runtime)) {
        throw new Error(
            `Tool "${name}" is not available in the ${runtime} runtime`,
        );
    }
};

export const defaultAgentToModelOutput: AgentToModelOutput<
    StandardAgentToolOutput
> = ({ output }) =>
    output.metadata.status === 'error'
        ? { type: 'error-text', value: output.result }
        : { type: 'text', value: output.result };

export const createAgentInputSchema = <TInput extends z.ZodTypeAny>(
    inputSchema: TInput,
): AgentInputSchema<TInput> => {
    const jsonSchema = zodToJsonSchema(inputSchema, {
        $refStrategy: 'root',
        target: 'jsonSchema7',
    }) as Record<string, unknown>;

    return {
        [aiSchemaSymbol]: true,
        _type: undefined as z.infer<TInput>,
        jsonSchema,
        validate: (value) => {
            const result = inputSchema.safeParse(value);

            if (result.success) {
                return { success: true, value: result.data as z.infer<TInput> };
            }

            return { success: false, error: result.error };
        },
        '~standard': {
            version: 1,
            vendor: 'lightdash',
            types: undefined as unknown as {
                input: z.input<TInput>;
                output: z.infer<TInput>;
            },
            validate: (value) => {
                const result = inputSchema.safeParse(value);

                if (result.success) {
                    return { value: result.data as z.infer<TInput> };
                }

                return {
                    issues: result.error.issues.map((issue) => ({
                        message: issue.message,
                        path: issue.path,
                    })),
                };
            },
            jsonSchema: {
                input: () => jsonSchema,
                output: () => jsonSchema,
            },
        },
    };
};

const text = (textContent: string): McpTextResult => ({
    content: [{ type: 'text', text: textContent }],
});

const error = (textContent: string): McpErrorResult => ({
    isError: true,
    content: [{ type: 'text', text: textContent }],
});

const structured = <TStructuredContent>(
    textContent: string,
    structuredContent: TStructuredContent,
): McpStructuredResult<TStructuredContent> => ({
    content: [{ type: 'text', text: textContent }],
    structuredContent,
});

export const createMcpToolResultBuilders = <
    TStructuredContent = unknown,
>(): McpToolResultBuilders<TStructuredContent> => ({
    text,
    error,
    structured,
});
