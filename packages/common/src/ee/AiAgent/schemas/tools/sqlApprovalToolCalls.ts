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

const SQL_POINTER = '/sql';

const isSqlChildPointer = (pointer: unknown): pointer is string =>
    typeof pointer === 'string' && pointer.startsWith(`${SQL_POINTER}/`);

const changesSqlAt = (pointer: unknown): pointer is string =>
    pointer === '' || pointer === SQL_POINTER || isSqlChildPointer(pointer);

const getOperationSqlError = (operation: unknown): string | null => {
    if (!isRecord(operation)) return null;
    const { op, path, from, value } = operation;
    if (op === 'move' && changesSqlAt(from)) {
        return `from: "move" cannot remove "${from}"; use "copy" to reuse the SQL`;
    }
    if (op === 'test' || !changesSqlAt(path)) return null;
    if (isSqlChildPointer(path)) {
        return `path: "${op}" cannot change "${path}"; use "replace" with the full SQL string at "${SQL_POINTER}"`;
    }
    if (op !== 'add' && op !== 'replace') {
        return `path: "${op}" cannot change "${path}"; use "replace" with the full SQL string`;
    }
    if (path === SQL_POINTER) {
        return typeof value === 'string'
            ? null
            : `path: "${op}" at "${SQL_POINTER}" needs a string value`;
    }
    return isRecord(value) && typeof value.sql === 'string'
        ? null
        : `path: "${op}" at "" needs an object value with a string "sql"`;
};

/** Operations that change a SQL chart's sql without a literal value, which approval cannot preview. */
export const getSqlChartPatchSqlErrors = (patch: unknown[]): string[] =>
    patch.flatMap((operation, index) => {
        const error = getOperationSqlError(operation);
        return error === null ? [] : [`patch[${index}].${error}`];
    });

/** The SQL a SQL chart patch sets; null when it sets none or changes it without a literal value. */
export const getPatchedSql = (patch: unknown): string | null => {
    if (!Array.isArray(patch) || getSqlChartPatchSqlErrors(patch).length > 0)
        return null;
    for (let index = patch.length - 1; index >= 0; index -= 1) {
        const operation: unknown = patch[index];
        if (isRecord(operation) && operation.op !== 'test') {
            const { path, value } = operation;
            if (path === SQL_POINTER && typeof value === 'string') return value;
            if (path === '' && isRecord(value) && typeof value.sql === 'string')
                return value.sql;
        }
    }
    return null;
};

/** Whether a JSON Patch sets a SQL chart's sql, so it needs approval. */
export const doesPatchTouchSqlChartSql = (patch: unknown): boolean =>
    getPatchedSql(patch) !== null;

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

// Surrounding whitespace and trailing semicolons never change the statement.
const normalizeApprovalSql = (sql: string): string => {
    let normalized = sql.trim();
    while (normalized.endsWith(';')) {
        normalized = normalized.slice(0, -1).trimEnd();
    }
    return normalized;
};

/** Whether approving one SQL string also approves the other. */
export const isSameApprovalSql = (a: string, b: string): boolean =>
    normalizeApprovalSql(a) === normalizeApprovalSql(b);

/** Step-progress id the server emits when it skips a call's prompt for SQL approved earlier in the turn. */
export const getSameTurnSqlApprovalProgressId = (toolCallId: string): string =>
    `${toolCallId}:same-turn-sql-approval`;
