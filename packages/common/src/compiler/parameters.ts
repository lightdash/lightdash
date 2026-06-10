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

// Regex for SQL parameter substitution - requires the full ${...} syntax.
// Used by `replaceLightdashValues` to find substitution sites.
export const parameterRegex =
    /\$\{(?:lightdash|ld)\.parameters\.(\w+(?:\.\w+)?)\}/g;

// Broader regex that also matches bare `ld.parameters.X` references — used to catch
// references inside Liquid template tags (e.g. `{% if ld.parameters.grain == "day" %}`),
// format strings, and ternary expressions. The lookbehind requires a non-word,
// non-dot boundary before `ld`/`lightdash` so identifiers like `myld.parameters.x`
// don't false-match.
const parameterReferencePattern =
    /(?<![\w.])(?:lightdash|ld)\.parameters\.(\w+(?:\.\w+)?)/g;

export enum LightdashParameters {
    PREFIX = 'lightdash.parameters',
    PREFIX_SHORT = 'ld.parameters',
}

const matchAll = (input: string, regex: RegExp): string[] => {
    const matches = input.match(regex);
    if (!matches) return [];
    return matches.map((match) => match.replace(regex, '$1'));
};

/**
 * Single source of truth for extracting parameter references from a templated SQL or
 * format string. Detects both `${ld.parameters.X}` substitution sites and bare
 * `ld.parameters.X` references inside Liquid template blocks (only when `{%` is present,
 * to avoid false positives in plain SQL).
 *
 * @param sources - One or more strings to scan (e.g. compiled SQL, sql_from, format string).
 * @returns A deduplicated array of parameter names.
 */
export const getParameterReferences = (
    ...sources: (string | undefined)[]
): string[] => {
    const references = new Set<string>();
    sources.forEach((source) => {
        if (!source || typeof source !== 'string') return;
        // Always match ${...} substitution sites.
        matchAll(source, parameterRegex).forEach((name) =>
            references.add(name),
        );
        // If the source contains Liquid tags, also match bare references inside them.
        if (source.includes('{%')) {
            matchAll(source, parameterReferencePattern).forEach((name) =>
                references.add(name),
            );
        }
    });
    return [...references];
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

/**
 * Validate parameter configuration using AJV against the JSON schema.
 */
export const validateParameterConfiguration = (
    parameters: Record<string, LightdashProjectParameter> | undefined,
): { isValid: boolean; error: string | null } => {
    if (!parameters || Object.keys(parameters).length === 0) {
        return { isValid: true, error: null };
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
