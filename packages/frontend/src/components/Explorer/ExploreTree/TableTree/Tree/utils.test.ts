import { DimensionType, FieldType, type Dimension } from '@lightdash/common';
import { getSearchResults } from './utils';

const makeDimension = (
    table: string,
    name: string,
    hidden: boolean,
): Dimension => ({
    fieldType: FieldType.DIMENSION,
    type: DimensionType.STRING,
    name,
    label: 'Division',
    table,
    tableLabel: table,
    sql: `\${TABLE}.${name}`,
    hidden,
});

describe('getSearchResults', () => {
    it('excludes hidden fields from matches', () => {
        const results = getSearchResults(
            {
                customers_division: makeDimension(
                    'customers',
                    'division',
                    false,
                ),
                customers_division_hidden: makeDimension(
                    'customers',
                    'division_hidden',
                    true,
                ),
            },
            'division',
        );

        expect(results).toEqual(['customers_division']);
    });

    it('returns no matches when the only match is hidden', () => {
        const results = getSearchResults(
            { regions_division: makeDimension('regions', 'division', true) },
            'division',
        );

        expect(results).toEqual([]);
    });
});
