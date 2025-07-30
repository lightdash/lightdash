import {
    parameterRegex,
    type ParametersValuesMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { replaceLightdashValues } from './utils';

const escapeParameterValues = (
    parameters: ParametersValuesMap,
    escapeString: (value: string) => string,
): ParametersValuesMap => {
    const escapedParameters: ParametersValuesMap = {};

    Object.entries(parameters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            // Handle array of strings
            escapedParameters[key] = value.map((item) => escapeString(item));
        } else {
            // Handle single string
            escapedParameters[key] = escapeString(value);
        }
    });

    return escapedParameters;
};

// We need this function so that we can replace when there's no access to the sql builder (e.g. in query builder)
export const replaceParameters = (
    sql: string,
    parameters: ParametersValuesMap,
    escapeString: (value: string) => string,
    quoteChar: string,
    wrapChar: string = '', // ! Default to non-wrapped sql
) =>
    replaceLightdashValues(
        parameterRegex,
        sql,
        escapeParameterValues(parameters, escapeString),
        quoteChar,
        wrapChar,
        {
            replacementName: 'parameter',
            throwOnMissing: false,
        },
    );

export const replaceParametersAsString = (
    sql: string,
    parameters: ParametersValuesMap,
    sqlBuilder: WarehouseSqlBuilder,
) =>
    replaceParameters(
        sql,
        parameters,
        sqlBuilder.escapeString.bind(sqlBuilder),
        sqlBuilder.getStringQuoteChar(),
        '',
    );

/**
 * **Warning:** this function does not escape the parameters.
 * Use it only when you are sure that the parameters are safe. E.g. when in used in filter string compiler it get's wrapped in quotes.
 */
export const unsafeReplaceParametersAsRaw = (
    sql: string,
    parameters: ParametersValuesMap,
    sqlBuilder: WarehouseSqlBuilder,
) =>
    replaceParameters(
        sql,
        parameters,
        sqlBuilder.escapeString.bind(sqlBuilder),
        '',
        '',
    );
