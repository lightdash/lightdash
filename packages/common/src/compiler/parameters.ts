/**
 * Utility functions for handling SQL parameter references
 */

import { CompileError } from '../types/errors';
import type { Table } from '../types/explore';
import type { LightdashProjectParameter } from '../types/lightdashProjectConfig';

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
 * @param projectParameters - The project parameters
 * @param exploreParameters - The explore parameters
 * @returns An array of available parameter names
 */
export const getAllExploreParameters = (
    exploreParameters: Record<string, LightdashProjectParameter> | undefined,
    includedTables: Table[],
): Record<string, LightdashProjectParameter> => {
    const includedTablesParameters: Record<string, LightdashProjectParameter> =
        includedTables.reduce((acc, table) => {
            const tableParameters = Object.keys(table.parameters || {}).reduce<
                Record<string, LightdashProjectParameter>
            >((acc2, p) => {
                const parameter = table.parameters?.[p];
                if (!parameter) {
                    return acc2;
                }
                return {
                    ...acc2,
                    [`${table.name}.${p}`]: parameter,
                };
            }, {});

            return {
                ...acc,
                ...tableParameters,
            };
        }, {});

    return {
        ...(exploreParameters ?? {}),
        ...includedTablesParameters,
    };
};
