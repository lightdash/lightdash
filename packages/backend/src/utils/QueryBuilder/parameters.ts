import {
    parameterRegex,
    UnexpectedServerError,
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
