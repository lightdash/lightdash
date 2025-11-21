import {
    parameterRegex,
    UnexpectedServerError,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { replaceLightdashValues } from './utils';

const validateAndSanitizeNumber = (value: unknown): number => {
    const num = Number(value);
    if (Number.isNaN(num) || !Number.isFinite(num)) {
        throw new UnexpectedServerError(
            `Invalid number parameter: "${value}" is not a valid number`,
        );
    }
    return num;
};

const validateAndSanitizeDate = (value: unknown): string => {
    // Date must be a string
    if (typeof value !== 'string') {
        throw new UnexpectedServerError(
            `Invalid date parameter: "${value}" is not a string`,
        );
    }

    // Validate ISO 8601 date format (YYYY-MM-DD)
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(value)) {
        throw new UnexpectedServerError(
            `Invalid date parameter: "${value}" is not a valid ISO 8601 date (YYYY-MM-DD)`,
        );
    }

    // Validate that the date is actually valid (e.g., not Feb 30)
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new UnexpectedServerError(
            `Invalid date parameter: "${value}" is not a valid ISO 8601 date (YYYY-MM-DD)`,
        );
    }

    // Verify the date string matches what Date parsed (catches things like "2025-02-30")
    const [year, month, day] = value.split('-').map(Number);
    if (
        date.getUTCFullYear() !== year ||
        date.getUTCMonth() + 1 !== month ||
        date.getUTCDate() !== day
    ) {
        throw new UnexpectedServerError(
            `Invalid date parameter: "${value}" is not a valid ISO 8601 date (YYYY-MM-DD)`,
        );
    }

    return value;
};

const escapeParameterValues = (
    parameters: ParametersValuesMap,
    escapeString: (value: string) => string,
): ParametersValuesMap => {
    const escapedParameters: ParametersValuesMap = {};

    Object.entries(parameters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            // Handle array of strings or numbers
            const escapedArray = value.map((item) =>
                typeof item === 'number' ? item : escapeString(item),
            );
            escapedParameters[key] = escapedArray as string[] | number[];
        } else {
            // Handle single string or number
            escapedParameters[key] =
                typeof value === 'number' ? value : escapeString(value);
        }
    });

    return escapedParameters;
};

export const safeReplaceParameters = ({
    sql,
    parameterValuesMap,
    escapeString,
    quoteChar,
    wrapChar,
    cast,
}: {
    sql: string;
    parameterValuesMap: ParametersValuesMap;
    escapeString: (value: string) => string;
    quoteChar: string;
    wrapChar?: string;
    cast?: 'DATE';
}) => {
    // Don't allow empty quote char
    if (quoteChar === '') {
        throw new UnexpectedServerError(
            'Empty quote character is not allowed when replacing parameters',
        );
    }

    return replaceLightdashValues(
        parameterRegex,
        sql,
        escapeParameterValues(parameterValuesMap, escapeString),
        quoteChar,
        wrapChar ?? '', // ! Default to non-wrapped sql
        {
            replacementName: 'parameter',
            throwOnMissing: false,
            cast,
        },
    );
};

export const safeReplaceParametersWithSqlBuilder = (
    sql: string,
    parameterValuesMap: ParametersValuesMap,
    sqlBuilder: WarehouseSqlBuilder,
) =>
    safeReplaceParameters({
        sql,
        parameterValuesMap,
        escapeString: sqlBuilder.escapeString.bind(sqlBuilder),
        quoteChar: sqlBuilder.getStringQuoteChar(),
    });

/**
 * **Warning:** this function does not wrap the parameter values in quotes.
 * Use it only when you are sure that the parameters are safe. E.g. when in used in filter string compiler it get's wrapped in quotes.
 */
export const unsafeReplaceParametersAsRaw = (
    sql: string,
    parameterValuesMap: ParametersValuesMap,
    sqlBuilder: WarehouseSqlBuilder,
) =>
    replaceLightdashValues(
        parameterRegex,
        sql,
        escapeParameterValues(
            parameterValuesMap,
            sqlBuilder.escapeString.bind(sqlBuilder),
        ),
        '',
        '',
        {
            replacementName: 'parameter',
            throwOnMissing: false,
        },
    );

/**
 * Replace parameters with type awareness - leverages existing safe/unsafe functions
 * Numbers use unsafeReplaceParametersAsRaw (no quotes), strings use safeReplaceParameters (with quotes)
 */
export const safeReplaceParametersWithTypes = ({
    sql,
    parameterValuesMap,
    parameterDefinitions,
    sqlBuilder,
    wrapChar,
}: {
    sql: string;
    parameterValuesMap: ParametersValuesMap;
    parameterDefinitions?: ParameterDefinitions;
    sqlBuilder: WarehouseSqlBuilder;
    wrapChar?: string;
}) => {
    // First, get all parameter references from the original SQL using the standard function
    // This ensures we capture ALL parameter references, not just the ones we have values for
    const allParametersResult = safeReplaceParameters({
        sql,
        parameterValuesMap,
        escapeString: sqlBuilder.escapeString.bind(sqlBuilder),
        quoteChar: sqlBuilder.getStringQuoteChar(),
        wrapChar,
    });

    // If no parameter definitions are provided, use the standard replacement
    if (!parameterDefinitions) {
        return allParametersResult;
    }

    // Split parameters by type
    const stringParameters: ParametersValuesMap = {};
    const numberParameters: ParametersValuesMap = {};
    const dateParameters: ParametersValuesMap = {};

    Object.entries(parameterValuesMap).forEach(([key, value]) => {
        const paramDef = parameterDefinitions?.[key];
        const paramType = paramDef?.type;

        if (paramType === 'number') {
            // Validate and convert to number to prevent SQL injection
            if (Array.isArray(value)) {
                numberParameters[key] = value.map(validateAndSanitizeNumber);
            } else {
                numberParameters[key] = validateAndSanitizeNumber(value);
            }
        } else if (paramType === 'date') {
            // Validate date format
            // Note: We don't support multiple dates
            if (Array.isArray(value)) {
                throw new UnexpectedServerError(
                    `Multiple date values not yet supported for parameter "${key}"`,
                );
            }
            dateParameters[key] = validateAndSanitizeDate(value);
        } else {
            stringParameters[key] = value;
        }
    });

    // First replace string parameters (with quotes and escaping)
    let processedSql = sql;
    if (Object.keys(stringParameters).length > 0) {
        const stringResult = safeReplaceParameters({
            sql: processedSql,
            parameterValuesMap: stringParameters,
            escapeString: sqlBuilder.escapeString.bind(sqlBuilder),
            quoteChar: sqlBuilder.getStringQuoteChar(),
            wrapChar,
        });
        processedSql = stringResult.replacedSql;
    }

    // Then replace date parameters (with CAST wrapper and quotes)
    if (Object.keys(dateParameters).length > 0) {
        const dateResult = safeReplaceParameters({
            sql: processedSql,
            parameterValuesMap: dateParameters,
            escapeString: sqlBuilder.escapeString.bind(sqlBuilder),
            quoteChar: sqlBuilder.getStringQuoteChar(),
            wrapChar,
            cast: 'DATE',
        });
        processedSql = dateResult.replacedSql;
    }

    // Finally replace number parameters (without quotes)
    if (Object.keys(numberParameters).length > 0) {
        const numberResult = unsafeReplaceParametersAsRaw(
            processedSql,
            numberParameters,
            sqlBuilder,
        );
        processedSql = numberResult.replacedSql;
    }

    // Return the processed SQL but use the original references from the full parameter scan
    return {
        replacedSql: processedSql,
        references: allParametersResult.references,
        missingReferences: allParametersResult.missingReferences,
    };
};
