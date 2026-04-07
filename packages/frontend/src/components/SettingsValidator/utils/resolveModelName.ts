/**
 * Given a broken field name from a validation error, resolve which model
 * (explore) it belongs to.
 *
 * @param fieldName - The full field ID, e.g. "orders_status_history_created_at"
 * @param baseTableName - The chart's base table name, e.g. "orders"
 * @param exploreNames - All available explore/model names in the project
 * @returns The model name the field belongs to
 */
export const resolveModelNameFromField = (
    fieldName: string,
    baseTableName: string | undefined,
    exploreNames: string[] | undefined,
): string => {
    if (!fieldName) return '';

    // Find the longest explore name that is a prefix of the field.
    // This avoids the collision where e.g. "orders" (the base table) would
    // match "orders_status_history_created_at" instead of the more specific
    // model "orders_status_history".
    if (exploreNames) {
        const longestMatch = exploreNames
            .filter((name) => fieldName.startsWith(`${name}_`))
            .sort((a, b) => b.length - a.length)[0];
        if (longestMatch) return longestMatch;
    }

    // Fallback when explores haven't loaded yet
    if (baseTableName && fieldName.startsWith(`${baseTableName}_`))
        return baseTableName;
    return fieldName.split('_')[0];
};
