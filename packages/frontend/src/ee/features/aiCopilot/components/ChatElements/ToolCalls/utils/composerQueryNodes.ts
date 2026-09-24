import {
    QuerySourceType,
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
