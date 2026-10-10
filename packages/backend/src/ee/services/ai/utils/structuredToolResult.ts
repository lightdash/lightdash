import type {
    AiAccessRefusal,
    ToolErrorStructuredContent,
} from '@lightdash/common';

/**
 * Success envelope of an agent tool: the model-facing `result` text, the tool
 * `metadata`, and the machine-readable `structuredContent` (also what MCP
 * surfaces as `structuredContent`). Generic over the metadata shape so tools
 * can attach their own diagnostics (e.g. grep's patternStats).
 */
export type ExecuteStructuredToolResult<
    TStructuredContent,
    TMetadata = { status: 'success' },
> = {
    result: string;
    metadata: TMetadata;
    structuredContent: TStructuredContent;
};

/** Failure envelope: `structuredContent` mirrors the error text as `{ error }`. */
interface ToolErrorWithRefusal extends ToolErrorStructuredContent {
    refusal?: AiAccessRefusal;
}

interface ToolErrorMetadata extends Record<string, unknown> {
    status: 'error';
    refusal?: AiAccessRefusal;
}

export interface ExecuteToolErrorResult<TMetadata = ToolErrorMetadata> {
    result: string;
    metadata: TMetadata;
    structuredContent: ToolErrorWithRefusal;
}

/** A failure the model should read as plain text, with no access refusal. */
export const toolFailure = (result: string): ExecuteToolErrorResult => ({
    result,
    metadata: { status: 'error' },
    structuredContent: { error: result },
});
