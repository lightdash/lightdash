/**
 * Universal null-safe equality. `NULL = NULL` is NULL in standard SQL, so JOIN
 * conditions silently drop rows where the compared columns are both NULL. This
 * helper treats two NULLs as equal, which is what pivot row/column ranking
 * joins (and any other null-tolerating join) need.
 */
export const defaultNullSafeEqualSql = (left: string, right: string): string =>
    `(${left} = ${right} OR (${left} IS NULL AND ${right} IS NULL))`;
