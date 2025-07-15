import type { ParametersValuesMap } from '@lightdash/common';
import { replaceLightdashValues } from './utils';

export const replaceParameters = (
    sql: string,
    parameters?: ParametersValuesMap,
    quoteChar: string = '', // ! Default to raw sql
    wrapChar: string = '', // ! Default to raw sql
) => {
    const parameterRegex = /\$\{(?:lightdash|ld)\.(?:parameters)\.(\w+)\}/g;
    return replaceLightdashValues(
        parameterRegex,
        sql,
        parameters ?? {},
        quoteChar,
        wrapChar,
        'parameter',
    );
};
