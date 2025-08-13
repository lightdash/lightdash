/**
 * Utility functions for handling SQL parameter references
 */

import { CompileError } from '../types/errors';

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

export const validateParameterReferences = (
    tableName: string,
    parameterReferences: string[],
    availableParameters: string[],
) => {
    const missingParameters = parameterReferences.filter(
        (p) => !availableParameters.includes(p),
    );

    if (missingParameters.length > 0) {
        throw new CompileError(
            `Failed to compile explore "${tableName}". Missing parameters: ${missingParameters.join(
                ', ',
            )}`,
            {},
        );
    }
};
