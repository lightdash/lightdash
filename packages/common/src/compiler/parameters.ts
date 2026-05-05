/**
 * Utility functions for handling SQL parameter references
 */

import Ajv from 'ajv';
import AjvErrors from 'ajv-errors';
import betterAjvErrors from 'better-ajv-errors';
import lightdashDbtYamlSchema from '../schemas/json/lightdash-dbt-2.0.json';
import { CompileError } from '../types/errors';
import type { CompiledTable, Table } from '../types/explore';
import type { LightdashProjectParameter } from '../types/lightdashProjectConfig';

// Regex for SQL parameter replacement - requires full ${} syntax
export const parameterRegex =
    /\$\{(?:lightdash|ld)\.parameters\.(\w+(?:\.\w+)?)\}/g;

// Regex for extracting parameter references - works with format strings, ternary expressions,
// and Liquid template blocks like {% if ld.parameters.grain == "day" %}
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

    // Also extract parameter references from Liquid template blocks
    // e.g., {% if ld.parameters.grain == "day" %}
    const liquidParameterReferences = compiledSql.includes('{%')
        ? getParameterReferences(compiledSql, parameterReferencePattern)
        : [];

    const formatParameterReferences =
        format && typeof format === 'string'
            ? getParameterReferences(format, parameterReferencePattern)
            : [];

    // Combine and deduplicate parameter references from all sources
    return Array.from(
        new Set([
            ...sqlParameterReferences,
            ...liquidParameterReferences,
            ...formatParameterReferences,
        ]),
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
        // When a short-form reference (e.g. `attribution_source`) doesn't match
        // but a model-prefixed parameter does (e.g. `model.attribution_source`),
        // surface the correct full reference so the user knows what to write.
        const hints = missingParameters.reduce<string[]>((acc, missing) => {
            if (missing.includes('.')) return acc;
            const matches = availableParameters.filter((p) =>
                p.endsWith(`.${missing}`),
            );
            if (matches.length === 0) return acc;
            const suggestions = matches
                .map((m) => `\${lightdash.parameters.${m}}`)
                .join(' or ');
            acc.push(
                `"${missing}" is a model-level parameter — use the model name prefix: ${suggestions}`,
            );
            return acc;
        }, []);

        const hintMsg = hints.length > 0 ? ` Hint: ${hints.join('; ')}` : '';

        throw new CompileError(
            `Failed to compile explore "${tableName}". Missing parameters: ${missingParameters.join(
                ', ',
            )}.${hintMsg}`,
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
 * Get all available parameter names for a project and explore.
 *
 * When `baseTable` is provided, parameters defined on tables other than the
 * base are still returned (so they can be referenced in SQL/liquid), but their
 * `required` flag is dropped. Required only applies to the explore's base
 * table — joined tables become required only if their params actually appear
 * in the compiled SQL (handled separately via `parameterReferences`).
 */
export const getAvailableParametersFromTables = (
    includedTables: (Table | CompiledTable)[],
    baseTable?: string,
): Record<string, LightdashProjectParameter> =>
    includedTables.reduce((acc, table) => {
        const tableName = table.originalName ?? table.name;
        const isBaseTable = baseTable !== undefined && tableName === baseTable;
        const tableParameters = Object.keys(table.parameters || {}).reduce<
            Record<string, LightdashProjectParameter>
        >((acc2, p) => {
            const parameter = table.parameters?.[p];
            if (!parameter) {
                return acc2;
            }

            const parameterKey = `${tableName}.${p}`;

            return {
                ...acc2,
                [parameterKey]: {
                    ...parameter,
                    type: parameter.type || 'string',
                    ...(baseTable !== undefined && !isBaseTable
                        ? { required: false }
                        : {}),
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

// Lazy-initialized AJV validator to avoid module-level side effects
let cached: {
    schema: object;
    validator: ReturnType<Ajv['compile']>;
} | null = null;

const getParametersSchemaAndValidator = ():
    | { schema: object; validator: ReturnType<Ajv['compile']> }
    | undefined => {
    if (!cached) {
        const parametersSchema =
            lightdashDbtYamlSchema.$defs?.modelMeta?.properties?.parameters;
        if (!parametersSchema) {
            console.warn(
                'Parameters schema not found in lightdash-dbt-2.0.json — expected $defs.modelMeta.properties.parameters. Skipping parameter config validation.',
            );
            return undefined;
        }
        const ajv = new Ajv({
            coerceTypes: true,
            allowUnionTypes: true,
            allErrors: true,
        });
        AjvErrors(ajv);
        cached = {
            schema: parametersSchema,
            validator: ajv.compile(parametersSchema),
        };
    }
    return cached;
};

export type ParameterScope = 'project' | 'model';

/**
 * Validate parameter configuration using AJV against the JSON schema.
 *
 * `scope` defaults to 'model' for backwards compatibility. When 'project' is
 * passed, fields that are only valid at model level (currently `required`) are
 * rejected with a clear error.
 */
export const validateParameterConfiguration = (
    parameters: Record<string, LightdashProjectParameter> | undefined,
    scope: ParameterScope = 'model',
): { isValid: boolean; error: string | null } => {
    if (!parameters || Object.keys(parameters).length === 0) {
        return { isValid: true, error: null };
    }

    if (scope === 'project') {
        const projectLevelRequired = Object.entries(parameters)
            .filter(([, def]) => def?.required === true)
            .map(([name]) => name);
        if (projectLevelRequired.length > 0) {
            return {
                isValid: false,
                error: `\`required: true\` is only supported on model-level parameters. Move these parameters under a model's \`config.meta.parameters\` to require them: ${projectLevelRequired.join(', ')}`,
            };
        }
    }

    const schemaAndValidator = getParametersSchemaAndValidator();
    if (!schemaAndValidator) {
        return { isValid: true, error: null };
    }

    const { schema, validator } = schemaAndValidator;

    if (!validator(parameters)) {
        const error = betterAjvErrors(
            schema,
            parameters,
            validator.errors || [],
            { indent: 2 },
        );
        return {
            isValid: false,
            error: error || 'Invalid parameter configuration',
        };
    }

    return { isValid: true, error: null };
};
