import { zodSchema } from '@ai-sdk/provider-utils';
import { type z } from 'zod';
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
): AgentInputSchema<TInput> =>
    zodSchema(inputSchema, {
        useReferences: true,
    });

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
