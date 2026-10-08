import assertUnreachable from '../../../../utils/assertUnreachable';

/** Agent tools whose SQL waits on the user's approval. */
export const SQL_APPROVAL_TOOL_NAMES = [
    'runSql',
    'runComposerQueries',
    'createContent',
    'editContent',
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const getPatch = (toolArgs: unknown): unknown =>
    isRecord(toolArgs) ? toolArgs.patch : undefined;

/** Whether a JSON Patch can change a SQL chart's sql, so it needs approval. */
export const doesPatchTouchSqlChartSql = (patch: unknown): boolean =>
    Array.isArray(patch) &&
    patch.some(
        (operation: unknown) =>
            isRecord(operation) &&
            ['path', 'from'].some((key) => {
                const pointer = operation[key];
                return pointer === '' || pointer === '/sql';
            }),
    );

/** The SQL a SQL chart patch sets, including by replacing the whole chart. */
export const getPatchedSql = (patch: unknown): string | null => {
    if (!Array.isArray(patch)) return null;
    for (let index = patch.length - 1; index >= 0; index -= 1) {
        const operation: unknown = patch[index];
        if (isRecord(operation)) {
            const { path, value } = operation;
            if (path === '/sql' && typeof value === 'string') return value;
            if (path === '' && isRecord(value) && typeof value.sql === 'string')
                return value.sql;
        }
    }
    return null;
};

/**
 * Content tools only gate on approval when they save new SQL: creating a SQL
 * chart, or editing one with a patch that can change its sql.
 */
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
        case 'editContent':
            return (
                isSqlChartContentArgs(toolArgs) &&
                doesPatchTouchSqlChartSql(getPatch(toolArgs))
            );
        default:
            return assertUnreachable(toolName, 'Unknown SQL approval tool');
    }
};

/** The SQL a pending approval asks the user to accept; null when the call carries none. */
export const getSqlApprovalSql = (toolArgs: unknown): string | null => {
    if (!isRecord(toolArgs)) return null;
    if (typeof toolArgs.sql === 'string') return toolArgs.sql;
    if (
        isRecord(toolArgs.content) &&
        typeof toolArgs.content.sql === 'string'
    ) {
        return toolArgs.content.sql;
    }
    return getPatchedSql(toolArgs.patch);
};
