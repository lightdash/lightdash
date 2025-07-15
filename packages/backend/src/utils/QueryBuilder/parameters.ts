import { replaceLightdashValues } from './utils';

export const replaceParameters = (
    sql: string,
    parameters: Record<string, string[]>,
    quoteChar: string,
    wrapChar: string,
) => {
    const parameterRegex = /\$\{(?:lightdash|ld)\.(?:parameters)\.(\w+)\}/g;
    return replaceLightdashValues(
        parameterRegex,
        sql,
        parameters,
        quoteChar,
        wrapChar,
        'parameter',
    );
};
