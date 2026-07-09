import assertUnreachable from '../../../utils/assertUnreachable';
import {
    type AgentToModelOutput,
    type McpErrorResult,
    type McpStructuredResult,
    type McpTextResult,
    type McpToolResultBuilders,
    type ToolDescription,
    type ToolDescriptionContext,
    type ToolOutput,
} from './defineTool';

export const resolveDescription = (
    description: ToolDescription,
    context: ToolDescriptionContext,
): string =>
    typeof description === 'function' ? description(context) : description;

export const toolOutputToText = (output: ToolOutput): string => {
    const items = Array.isArray(output) ? output : [output];
    return items
        .map((item) => {
            if (item.status === 'error') return item.error;
            switch (item.type) {
                case 'json':
                    return JSON.stringify(item.result, null, 2);
                case 'csv':
                case 'string':
                    return item.result;
                default:
                    return assertUnreachable(item, 'Unknown tool output type');
            }
        })
        .join('\n');
};

// Arrays can only contain success items, so only a single item can be an error.
export const hasToolOutputError = (output: ToolOutput): boolean =>
    !Array.isArray(output) && output.status === 'error';

export const defaultAgentToModelOutput: AgentToModelOutput<ToolOutput> = ({
    output,
}) => ({
    type: hasToolOutputError(output) ? 'error-text' : 'text',
    value: toolOutputToText(output),
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

export const appendMcpText = <TStructuredContent>(
    result: McpStructuredResult<TStructuredContent>,
    textContent: string,
): McpStructuredResult<TStructuredContent> => ({
    ...result,
    content: [...result.content, { type: 'text', text: textContent }],
});

export const createMcpToolResultBuilders = <
    TStructuredContent = unknown,
>(): McpToolResultBuilders<TStructuredContent> => ({
    text,
    error,
    structured,
});
