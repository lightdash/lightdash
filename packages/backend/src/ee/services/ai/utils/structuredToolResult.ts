import type { ToolErrorStructuredContent } from '@lightdash/common';

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
export type ExecuteToolErrorResult<TMetadata = { status: 'error' }> = {
    result: string;
    metadata: TMetadata;
    structuredContent: ToolErrorStructuredContent;
};
