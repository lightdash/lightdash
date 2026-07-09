import { toolOutputSchema, toolOutputToText } from '@lightdash/common';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Maps a tool's raw execute output to the persisted tool-result row shape:
 * `result` is the text the model sees, `metadata` is the per-tool payload
 * consumed by the frontend. Falls back to legacy `{ result, metadata }`
 * outputs and arbitrary MCP payloads.
 */
export const normalizeToolOutput = (
    output: unknown,
): { result: string; metadata?: Record<string, unknown> } => {
    const toolOutput = toolOutputSchema.safeParse(output);
    if (toolOutput.success) {
        const items = Array.isArray(toolOutput.data)
            ? toolOutput.data
            : [toolOutput.data];
        return {
            result: toolOutputToText(toolOutput.data),
            metadata: items.find((item) => item.metadata !== undefined)
                ?.metadata,
        };
    }

    if (isRecord(output) && typeof output.result === 'string') {
        return {
            result: output.result,
            metadata: isRecord(output.metadata) ? output.metadata : undefined,
        };
    }

    if (typeof output === 'string') {
        return { result: output };
    }

    try {
        return { result: JSON.stringify(output) ?? String(output) };
    } catch {
        return { result: String(output) };
    }
};
