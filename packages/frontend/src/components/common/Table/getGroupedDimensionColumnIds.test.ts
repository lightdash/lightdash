import { DimensionType, FieldType, type Dimension } from '@lightdash/common';
import { getGroupedDimensionColumnIds } from './getGroupedDimensionColumnIds';
import { type TableColumn } from './types';

const dimension = (name: string): Dimension =>
    ({
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name,
        label: name,
        table: 't',
        tableLabel: 't',
        sql: '',
        hidden: false,
    }) as Dimension;

const dimColumn = (id: string): TableColumn => ({
    id,
    meta: { item: dimension(id) },
});

const metricColumn = (id: string): TableColumn => ({
    id,
    // no dimension item -> treated as non-dimension (metric/calc)
    meta: {},
});

describe('getGroupedDimensionColumnIds', () => {
    it('returns dimension columns in display order minus the leaf', () => {
        const columns = [
            dimColumn('region'),
            dimColumn('country'),
            dimColumn('city'),
            metricColumn('revenue'),
        ];
        const columnOrder = ['region', 'country', 'city', 'revenue'];

        expect(getGroupedDimensionColumnIds(columns, columnOrder)).toEqual([
            'region',
            'country',
        ]);
    });

    it('respects columnOrder, not the columns array order', () => {
        const columns = [
            dimColumn('city'),
            dimColumn('region'),
            dimColumn('country'),
        ];
        const columnOrder = ['region', 'country', 'city'];

        // ordered by columnOrder (region, country, city) minus leaf (city)
        expect(getGroupedDimensionColumnIds(columns, columnOrder)).toEqual([
            'region',
            'country',
        ]);
    });

    it('ignores metric columns when picking the leaf', () => {
        const columns = [
            dimColumn('region'),
            metricColumn('revenue'),
            dimColumn('country'),
        ];
        // metric interleaved between dims; leaf is the last DIMENSION (country)
        const columnOrder = ['region', 'revenue', 'country'];

        expect(getGroupedDimensionColumnIds(columns, columnOrder)).toEqual([
            'region',
        ]);
    });

    it('returns empty for a single dimension (only the leaf, nothing to merge)', () => {
        const columns = [dimColumn('region'), metricColumn('revenue')];
        const columnOrder = ['region', 'revenue'];

        expect(getGroupedDimensionColumnIds(columns, columnOrder)).toEqual([]);
    });

    it('returns empty when there are no dimensions', () => {
        const columns = [metricColumn('revenue'), metricColumn('count')];
        const columnOrder = ['revenue', 'count'];

        expect(getGroupedDimensionColumnIds(columns, columnOrder)).toEqual([]);
    });
});
