/**
 * The maximum number of columns that can be generated from a pivot operation.
 * This limit is enforced to prevent performance issues and memory overload
 * when a GROUP BY query results in too many pivot columns.
 */
export const MAX_PIVOT_COLUMN_LIMIT = 100;

// Max 32-bit signed integer, as Number.MAX_SAFE_INTEGER is possibly causing issues for Redshift "all results" queries
export const MAX_SAFE_INTEGER = 2_147_483_647;
