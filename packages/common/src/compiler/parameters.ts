/**
 * Utility functions for handling SQL parameter references
 */

import { CompileError } from '../types/errors';
import type { CompiledTable, Table } from '../types/explore';
import type { LightdashProjectParameter } from '../types/lightdashProjectConfig';

// Regex for SQL parameter replacement - requires full ${} syntax
export const parameterRegex =
    /\$\{(?:lightdash|ld)\.parameters\.(\w+(?:\.\w+)?)\}/g;

// Regex for extracting parameter references - works with format strings and ternary expressions
const parameterReferencePattern =
    /(?:lightdash|ld)\.parameters\.(\w+(?:\.\w+)?)/g;

export enum LightdashParameters {
    PREFIX = 'lightdash.parameters',
    PREFIX_SHORT = 'ld.parameters',
}

/**
 * Extracts parameter references from SQL strings or format strings
 * @param sql - The SQL or format string to extract parameter references from
 * @returns An array of unique parameter names referenced in the string
 */
export const getParameterReferences = (
    sql: string,
    regex = parameterRegex,
): string[] => {
    const matches = sql.match(regex);

    if (!matches) {
        return [];
    }

    // Extract parameter names using the regex capture group and remove duplicates
    const parameterNames = matches.map((match) => match.replace(regex, '$1'));

    // Return unique parameter names
    return [...new Set(parameterNames)];
};

/**
 * Extracts and combines parameter references from both SQL and format strings
 * @param compiledSql - The compiled SQL to extract parameters from
 * @param format - Optional format string to extract parameters from
 * @returns An array of unique parameter names from both sources
 */
export const getParameterReferencesFromSqlAndFormat = (
    compiledSql: string,
    format?: string,
): string[] => {
    const sqlParameterReferences = getParameterReferences(compiledSql);

    const formatParameterReferences =
        format && typeof format === 'string'
            ? getParameterReferences(format, parameterReferencePattern)
            : [];

    // Combine and deduplicate parameter references from both sources
    return Array.from(
        new Set([...sqlParameterReferences, ...formatParameterReferences]),
    );
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

/**
 * Get all available parameter names for a project and explore
 * @param projectParameters - The project parameters
 * @param exploreParameters - The explore parameters
 * @returns An array of available parameter names
 */
export const getAvailableParameterNames = (
    projectParameters: Record<string, LightdashProjectParameter> | undefined,
    exploreParameters: Record<string, LightdashProjectParameter> | undefined,
): string[] =>
    Object.keys(projectParameters || {}).concat(
        Object.keys(exploreParameters || {}),
    );

/**
 * Get all available parameter names for a project and explore
 * @param exploreParameters - The explore parameters
 * @param includedTables - The included tables
 * @returns An array of available parameter names
 */
export const getAvailableParametersFromTables = (
    includedTables: (Table | CompiledTable)[],
): Record<string, LightdashProjectParameter> =>
    includedTables.reduce((acc, table) => {
        const tableParameters = Object.keys(table.parameters || {}).reduce<
            Record<string, LightdashProjectParameter>
        >((acc2, p) => {
            const parameter = table.parameters?.[p];
            if (!parameter) {
                return acc2;
            }

            // Use the original table name for parameters if available, otherwise use the current name
            const tableName = table.originalName ?? table.name;
            const parameterKey = `${tableName}.${p}`;

            return {
                ...acc2,
                [parameterKey]: {
                    ...parameter,
                    type: parameter.type || 'string',
                },
            };
        }, {});

        return {
            ...acc,
            ...tableParameters,
        };
    }, {});

/**
 * Validate parameter names
 * @param parameters - The parameters to validate
 * @returns True if any parameter name doesn't match the valid pattern, false otherwise
 */
export const validateParameterNames = (
    parameters: Record<string, LightdashProjectParameter> | undefined,
) => {
    const validNamePattern = /^[a-zA-Z0-9_-]+$/;
    const invalidParameters = Object.keys(parameters || {}).filter(
        (paramName) => !validNamePattern.test(paramName),
    );
    return {
        isInvalid: invalidParameters.length > 0,
        invalidParameters,
    };
};
