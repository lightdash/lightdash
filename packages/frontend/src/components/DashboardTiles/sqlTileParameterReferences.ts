import { getParameterReferences } from '@lightdash/common';

/**
 * What a SQL tile reports as its query's references: nothing while its SQL
 * loads (it hasn't run), null when loading failed, else the SQL's references.
 */
export const getSqlTileParameterReport = ({
    sql,
    hasError,
}: {
    sql: string | undefined;
    hasError: boolean;
}): { references: string[] | null } | null => {
    if (sql !== undefined) return { references: getParameterReferences(sql) };
    return hasError ? { references: null } : null;
};
