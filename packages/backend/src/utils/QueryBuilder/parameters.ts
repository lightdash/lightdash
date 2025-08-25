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
}: {
    sql: string;
    parameterValuesMap: ParametersValuesMap;
    escapeString: (value: string) => string;
    quoteChar: string;
    wrapChar?: string;
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

    Object.entries(parameterValuesMap).forEach(([key, value]) => {
        const paramDef = parameterDefinitions?.[key];
        const isNumberType = paramDef?.type === 'number';

        if (isNumberType) {
            // Validate and convert to number to prevent SQL injection
            if (Array.isArray(value)) {
                numberParameters[key] = value.map(validateAndSanitizeNumber);
            } else {
                numberParameters[key] = validateAndSanitizeNumber(value);
            }
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

    // Then replace number parameters (without quotes)
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
