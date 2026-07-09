/**
 * Shared envelope for structured tool executors (grepFields, getMetadata, …):
 * the human-readable `result` text, the tool `metadata`, and the machine-readable
 * `structuredContent` MCP surfaces as `structuredContent`. Kept generic over the
 * metadata shape so tools can attach their own diagnostics (e.g. grep's
 * patternStats) without each redefining the wrapper.
 */
export type ExecuteStructuredToolResult<
    TStructuredContent,
    TMetadata = { status: 'success' },
> = {
    result: string;
    metadata: TMetadata;
    structuredContent: TStructuredContent;
};
