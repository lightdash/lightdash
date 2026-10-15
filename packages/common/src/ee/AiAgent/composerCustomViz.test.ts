import { DimensionType } from '../../types/field';
import { QuerySourceType, type SourceQuery } from '../../types/querySources';
import { type ResultColumn } from '../../types/results';
import {
    getComposerCustomVizPool,
    getComposerCustomVizPools,
    getComposerCustomVizSelectedFields,
} from './composerCustomViz';

const column = (reference: string, type: DimensionType): ResultColumn => ({
    reference,
    type,
});

const columns = [
    column('orders_status', DimensionType.STRING),
    column('orders_total', DimensionType.NUMBER),
    column('orders_year', DimensionType.NUMBER),
    column('share', DimensionType.NUMBER),
];

const semanticNode: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_year', 'orders_missing'],
    metrics: ['orders_total'],
};

describe('getComposerCustomVizSelectedFields', () => {
    test('a semantic layer node declares dimensions and metrics; the rest are table calculations', () => {
        expect(
            getComposerCustomVizSelectedFields(columns, semanticNode),
        ).toEqual({
            dimensions: ['orders_status', 'orders_year'],
            metrics: ['orders_total'],
            tableCalculations: ['share'],
        });
    });

    test('other nodes split by column type', () => {
        expect(getComposerCustomVizSelectedFields(columns, null)).toEqual({
            dimensions: ['orders_status'],
            metrics: ['orders_total', 'orders_year', 'share'],
            tableCalculations: [],
        });
    });
});

describe('getComposerCustomVizPools', () => {
    test('slot types draw from their pools', () => {
        const pools = getComposerCustomVizPools(columns, semanticNode);
        expect(getComposerCustomVizPool(pools, 'dimension')).toEqual([
            'orders_status',
            'orders_year',
        ]);
        expect(getComposerCustomVizPool(pools, 'series')).toEqual(
            pools.dimension,
        );
        expect(getComposerCustomVizPool(pools, 'metric')).toEqual([
            'orders_total',
            'share',
        ]);
        expect(getComposerCustomVizPool(pools, 'column')).toEqual([
            'orders_total',
            'share',
            'orders_status',
            'orders_year',
        ]);
    });
});
