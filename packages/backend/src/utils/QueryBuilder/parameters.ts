import type { ParametersValuesMap } from '@lightdash/common';
import { parameterRegex } from '@lightdash/common/src/compiler/parameters';
import { replaceLightdashValues } from './utils';

export const replaceParameters = (
    sql: string,
    parameters?: ParametersValuesMap,
    quoteChar: string = '', // ! Default to raw sql
    wrapChar: string = '', // ! Default to raw sql
) =>
    replaceLightdashValues(
        parameterRegex,
        sql,
        parameters ?? {},
        quoteChar,
        wrapChar,
        'parameter',
    );
