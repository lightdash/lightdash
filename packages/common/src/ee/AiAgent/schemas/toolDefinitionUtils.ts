import { type z } from 'zod';
import {
    type AgentToModelOutput,
    type McpErrorResult,
    type McpStructuredResult,
    type McpTextResult,
    type McpToolResultBuilders,
    type StandardAgentToolOutput,
    type ToolDescription,
    type ToolRuntime,
    type ToolRuntimeOptions,
} from './defineTool';

export const resolveDescription = ({
    canonicalName,
    description,
    descriptionVarsSchema,
    options,
    runtime,
    runtimeName,
}: {
    canonicalName: string;
    description: ToolDescription;
    descriptionVarsSchema: z.ZodType<unknown> | null;
    options: ToolRuntimeOptions | undefined;
    runtime: ToolRuntime;
    runtimeName: string;
}): string => {
    const vars = (() => {
        if (descriptionVarsSchema === null) {
            return undefined;
        }
        if (options?.descriptionVars === undefined) {
            throw new Error(
                `Tool "${canonicalName}" description requires descriptionVars`,
            );
        }
        return descriptionVarsSchema.parse(options.descriptionVars);
    })();

    return typeof description === 'function'
        ? description(runtimeName, { runtime, canonicalName, vars })
        : description;
};

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
