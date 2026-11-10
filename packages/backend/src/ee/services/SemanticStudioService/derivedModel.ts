const DERIVED_SQL_FROM = /^\s*\(?\s*(select|with)\b/i;

type Column = { name: string; type: string };

/** Whether sql_from is a query rather than a table. */
export const isDerivedSqlFrom = (sqlFrom: string): boolean =>
    DERIVED_SQL_FROM.test(sqlFrom);

/** Wraps a derived model's query so it compiles as FROM (...) AS model, or null when it holds more than one statement. */
export const toDerivedSqlFrom = (sqlFrom: string): string | null => {
    const query = sqlFrom.replace(/;\s*$/, '').trim();
    if (query.includes(';')) return null;
    return query.startsWith('(') ? query : `(\n${query}\n)`;
};
