import assertUnreachable from '../../../../utils/assertUnreachable';

/** Agent tools whose SQL waits on the user's approval. */
export const SQL_APPROVAL_TOOL_NAMES = [
    'runSql',
    'runComposerQueries',
    'createContent',
] as const;

export type SqlApprovalToolName = (typeof SQL_APPROVAL_TOOL_NAMES)[number];

export const isSqlApprovalToolName = (
    toolName: string,
): toolName is SqlApprovalToolName =>
    (SQL_APPROVAL_TOOL_NAMES as readonly string[]).includes(toolName);

export const isSqlChartContentArgs = (toolArgs: unknown): boolean =>
    typeof toolArgs === 'object' &&
    toolArgs !== null &&
    'type' in toolArgs &&
    toolArgs.type === 'sql_chart';

/** Content tools only gate on approval when they save a SQL chart. */
export const isSqlApprovalToolCall = (
    toolName: string,
    toolArgs: unknown,
): toolName is SqlApprovalToolName => {
    if (!isSqlApprovalToolName(toolName)) return false;
    switch (toolName) {
        case 'runSql':
        case 'runComposerQueries':
            return true;
        case 'createContent':
            return isSqlChartContentArgs(toolArgs);
        default:
            return assertUnreachable(toolName, 'Unknown SQL approval tool');
    }
};

/** The SQL a pending approval asks the user to accept. */
export const getSqlApprovalSql = (toolArgs: unknown): string => {
    if (typeof toolArgs !== 'object' || toolArgs === null) return '';
    if ('sql' in toolArgs && typeof toolArgs.sql === 'string') {
        return toolArgs.sql;
    }
    if (
        'content' in toolArgs &&
        typeof toolArgs.content === 'object' &&
        toolArgs.content !== null &&
        'sql' in toolArgs.content &&
        typeof toolArgs.content.sql === 'string'
    ) {
        return toolArgs.content.sql;
    }
    return '';
};
