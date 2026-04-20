import { PostgresSqlGenerator } from './postgres';

// Redshift is PostgreSQL-compatible for every SQL construct the formula
// package emits: double-quoted identifiers, `%` modulo operator,
// `EXTRACT(YEAR FROM ...)` date parts, `CURRENT_DATE` / `CURRENT_TIMESTAMP`,
// `CONCAT`, `LENGTH`, and `SUM(x) OVER ()` windowing. A dedicated class
// rather than reusing `PostgresSqlGenerator` directly keeps the dialect
// grep-able and gives future divergences (should they ever arise) a place
// to land without a refactor.
export class RedshiftSqlGenerator extends PostgresSqlGenerator {}
