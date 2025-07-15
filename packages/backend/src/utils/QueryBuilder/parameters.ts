import type { ParametersValuesMap } from '@lightdash/common';
import { parameterRegex } from '@lightdash/common/src/compiler/parameters';
import { replaceLightdashValues } from './utils';

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
        'parameter',
    );
