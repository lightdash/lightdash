import {
    QuerySourceType,
    type AiAgentToolResult,
    type ToolComposerQueriesArgs,
    type ToolComposerQueryNode,
} from '@lightdash/common';

/**
 * Narrows streamed or persisted composer tool args to their pipeline nodes.
 * Args may be partial mid-stream, so nodes without an id are dropped.
 */
export const getComposerQueryNodes = (
    toolArgs: unknown,
): ToolComposerQueryNode[] => {
    if (!toolArgs || typeof toolArgs !== 'object') return [];
    const { queries } = toolArgs as Partial<ToolComposerQueriesArgs>;
    if (!Array.isArray(queries)) return [];
    return queries.filter(
        (node): node is ToolComposerQueryNode =>
            typeof node?.nodeId === 'string',
    );
};

export const isWarehouseSqlNode = (node: ToolComposerQueryNode) =>
    node.sourceType === QuerySourceType.SQL;

/**
 * The error text of a failed composer call, from its persisted tool result.
 * The model-facing wrapper is dropped when the error sits in a fenced block.
 */
export const getComposerFailureMessage = (
    toolResult: AiAgentToolResult | undefined,
): string | null => {
    if (toolResult?.toolName !== 'runComposerQueries') return null;
    const metadata = toolResult.metadata as { status?: string } | null;
    if (metadata?.status !== 'error') return null;
    const fenced = /```[^\n]*\n([\s\S]*?)\n```/.exec(toolResult.result);
    const message = (fenced?.[1] ?? toolResult.result).trim();
    return message.length > 0 ? message : null;
};
