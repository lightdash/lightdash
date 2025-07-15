import { replaceLightdashValues } from './utils';

export const replaceParameters = (
    sql: string,
    parameters: Record<string, string[]>,
    quoteChar: string,
    wrapChar: string,
) => {
    const parameterRegex = /\$\{(?:lightdash|ld)\.(?:parameter)\.(\w+)\}/g;
    return replaceLightdashValues(
        parameterRegex,
        sql,
        parameters,
        quoteChar,
        wrapChar,
        'parameter',
    );
};
