import type { ParametersValuesMap } from '@lightdash/common';
import { parameterRegex } from '@lightdash/common/src/compiler/parameters';
import { replaceLightdashValues } from './utils';

export const replaceParameters = (
    sql: string,
    parameters: ParametersValuesMap,
    quoteChar: string,
    wrapChar: string = '', // ! Default to non-wrapped sql
) => {
    if (!quoteChar) {
        throw new Error('Quote character is required');
    }

    return replaceLightdashValues(
        parameterRegex,
        sql,
        parameters,
        quoteChar,
        wrapChar,
        'parameter',
    );
};
