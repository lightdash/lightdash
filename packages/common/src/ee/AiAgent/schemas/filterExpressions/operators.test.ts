import { expect, expectTypeOf, it } from 'vitest';
import {
    filterExpressionOperatorDefinitions,
    type FilterExpressionArgumentCount,
} from './operators';

it('keeps expected arities aligned with canonical operators', () => {
    expectTypeOf<3>().not.toExtend<FilterExpressionArgumentCount>();

    const argumentCounts = filterExpressionOperatorDefinitions.flatMap(
        ({ argumentCountByFilterType }) =>
            Object.values(argumentCountByFilterType).filter(
                (argumentCount) => argumentCount !== null,
            ),
    );

    const expectedArgumentCounts = [
        0,
        1,
        2,
        'oneOrMore',
    ] satisfies FilterExpressionArgumentCount[];

    expect(new Set(argumentCounts)).toEqual(new Set(expectedArgumentCounts));
});
