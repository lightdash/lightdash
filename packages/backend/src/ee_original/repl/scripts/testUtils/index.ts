import { deepEqual, type AnyType } from '@lightdash/common';
import type { FunctionQueryMatcher, RawQuery } from 'knex-mock-client';

export function queryMatcher(
    tableName: string,
    params: AnyType[] = [],
): FunctionQueryMatcher {
    return ({ sql, bindings }: RawQuery) =>
        sql.includes(tableName) &&
        params.length === bindings.length &&
        params.reduce(
            (valid, arg, index) => valid && deepEqual(bindings[index], arg),
            true,
        );
}
