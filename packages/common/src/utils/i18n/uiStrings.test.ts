import { FilterOperator, UnitOfTime } from '../../types/filter';
import { DateGranularity } from '../../types/timeFrames';
import { filterOperatorLabel } from '../filterLabels';
import { DEFAULT_UI_STRINGS, interpolateUiString } from './uiStrings';

describe('interpolateUiString', () => {
    it('replaces named tokens', () => {
        expect(interpolateUiString('Applies to {n} charts', { n: 3 })).toEqual(
            'Applies to 3 charts',
        );
    });

    it('leaves unknown tokens untouched', () => {
        expect(interpolateUiString('Hi {name}', {})).toEqual('Hi {name}');
    });

    it('replaces multiple tokens', () => {
        expect(interpolateUiString('{a} and {b}', { a: 'x', b: 'y' })).toEqual(
            'x and y',
        );
    });
});

describe('DEFAULT_UI_STRINGS', () => {
    it('has no empty values', () => {
        const emptyKeys = Object.entries(DEFAULT_UI_STRINGS)
            .filter(([, value]) => value.length === 0)
            .map(([key]) => key);
        expect(emptyKeys).toEqual([]);
    });

    it('has a granularity label for every DateGranularity', () => {
        Object.values(DateGranularity).forEach((granularity) => {
            expect(
                DEFAULT_UI_STRINGS[`dateZoom.granularities.${granularity}`],
            ).toEqual(granularity);
        });
    });

    it('has a label for every FilterOperator, matching filterOperatorLabel', () => {
        Object.values(FilterOperator).forEach((operator) => {
            expect(DEFAULT_UI_STRINGS[`filters.operators.${operator}`]).toEqual(
                filterOperatorLabel[operator],
            );
        });
    });

    it('has all four forms for every UnitOfTime', () => {
        Object.values(UnitOfTime).forEach((unit) => {
            expect(
                DEFAULT_UI_STRINGS[`filters.unitsOfTime.${unit}.singular`],
            ).toEqual(unit.slice(0, -1));
            expect(
                DEFAULT_UI_STRINGS[`filters.unitsOfTime.${unit}.plural`],
            ).toEqual(unit);
            expect(
                DEFAULT_UI_STRINGS[
                    `filters.unitsOfTime.${unit}.completedSingular`
                ],
            ).toEqual(`completed ${unit.slice(0, -1)}`);
            expect(
                DEFAULT_UI_STRINGS[
                    `filters.unitsOfTime.${unit}.completedPlural`
                ],
            ).toEqual(`completed ${unit}`);
        });
    });
});
