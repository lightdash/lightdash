// Strip --line and /* block */ comments + string literals so subsequent
// keyword checks don't false-positive on text that's inside a comment or a
// string. We don't execute the stripped version; it is used only for validation.
const SQL_COMMENTS_AND_STRINGS = /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^']|'')*'/g;
const stripCommentsAndStrings = (sql: string): string =>
    sql.replace(SQL_COMMENTS_AND_STRINGS, ' ');

const STARTS_WITH_SELECT_OR_WITH = /^\s*(WITH|SELECT)\b/i;
const FORBIDDEN_STATEMENTS =
    /\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE|MERGE|CALL|EXECUTE)\b/i;
const INFORMATION_SCHEMA = /\binformation_schema\b/i;

export const validateSelectOnlySql = (sql: string) => {
    const stripped = stripCommentsAndStrings(sql);
    if (!STARTS_WITH_SELECT_OR_WITH.test(stripped)) {
        throw new Error('Only SELECT or WITH queries are allowed.');
    }
    if (FORBIDDEN_STATEMENTS.test(stripped)) {
        throw new Error(
            'SQL contains forbidden statements (INSERT/UPDATE/DELETE/DDL). Only SELECT queries are allowed.',
        );
    }
    if (INFORMATION_SCHEMA.test(stripped)) {
        throw new Error(
            'Querying information_schema is forbidden. Use describeWarehouseTable for column discovery on a raw table, or listWarehouseTables to find table names. If neither returns what you need, ask the user — do not introspect via SQL.',
        );
    }
};
