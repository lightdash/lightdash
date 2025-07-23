import {
    parameterRegex,
    type ParametersValuesMap,
    type WarehouseSqlBuilder,
} from '@lightdash/common';
import { replaceLightdashValues } from './utils';

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
) => replaceParameters(sql, parameters, sqlBuilder.getStringQuoteChar(), '');

export const replaceParametersAsRaw = (
    sql: string,
    parameters: ParametersValuesMap,
) => replaceParameters(sql, parameters, '', '');
