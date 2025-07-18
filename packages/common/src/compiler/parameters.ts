/**
 * Utility functions for handling SQL parameter references
 */

export const parameterRegex = /\$\{(?:lightdash|ld)\.(?:parameters)\.(\w+)\}/g;

/**
 * Extracts parameter references from SQL strings
 * @param sql - The SQL string to extract parameter references from
 * @returns An array of unique parameter names referenced in the SQL
 */
export const getParameterReferences = (sql: string): string[] => {
    const matches = sql.match(parameterRegex);

    if (!matches) {
        return [];
    }

    // Extract parameter names using the regex capture group and remove duplicates
    const parameterNames = matches.map((match) =>
        match.replace(parameterRegex, '$1'),
    );

    // Return unique parameter names
    return [...new Set(parameterNames)];
};
