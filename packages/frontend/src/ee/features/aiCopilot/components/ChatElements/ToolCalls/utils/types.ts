export type ToolCallSummary = {
    toolCallId: string;
    toolName: string;
    toolArgs: unknown;
    /**
     * The tool's output once it has resolved. Populated for live streaming
     * (preliminary) updates and for the final result. `undefined` while the
     * tool is still streaming its input.
     */
    toolOutput?: unknown;
    /**
     * `true` while the tool is yielding preliminary updates (async-generator
     * execute), `false` once the final non-preliminary result has landed,
     * `undefined` when toolOutput is absent.
     */
    isPreliminary?: boolean;
};
