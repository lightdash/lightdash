import {
    parameterRegex,
    type ParametersValuesMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { replaceLightdashValues } from './utils';

const escapeParameterValues = (
    parameters: ParametersValuesMap,
    sqlBuilder: WarehouseSqlBuilder,
): ParametersValuesMap => {
    const escapedParameters: ParametersValuesMap = {};

    Object.entries(parameters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
            // Handle array of strings
            escapedParameters[key] = value.map((item) =>
                sqlBuilder.escapeString(item),
            );
        } else {
            // Handle single string
            escapedParameters[key] = sqlBuilder.escapeString(value);
        }
    });

    return escapedParameters;
};

// We need this function so that we can replace when there's no access to the sql builder (e.g. in query builder)
export const replaceParameters = (
    sql: string,
    parameters: ParametersValuesMap,
    quoteChar: string,
    wrapChar: string = '', // ! Default to non-wrapped sql
) =>
    replaceLightdashValues(
        parameterRegex,
        sql,
        parameters,
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
        escapeParameterValues(parameters, sqlBuilder),
        sqlBuilder.getStringQuoteChar(),
        '',
    );

export const replaceParametersAsRaw = (
    sql: string,
    parameters: ParametersValuesMap,
    sqlBuilder: WarehouseSqlBuilder,
) =>
    replaceParameters(
        sql,
        escapeParameterValues(parameters, sqlBuilder),
        '',
        '',
    );
