import {
    DashboardTileParameterSource,
    QuerySourceType,
    type ComposerChartPipelineNode,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getComposerTileParameterItems } from './composerTileParameterItems';

const orders: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: [],
    parameters: { region: 'EU' },
};

const tagged: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'tagged',
    title: 'Tagged',
    sql: 'select * from orders',
    references: ['orders'],
};

const definitions = {
    region: { label: 'Region', default: 'US' },
    currency: { label: 'Currency' },
};

describe('getComposerTileParameterItems', () => {
    it('shows a value every node ran with once, unlabelled', () => {
        const items = getComposerTileParameterItems({
            nodes: [orders, tagged],
            usedParameterValuesByNodeId: {
                orders: { currency: 'eur' },
                tagged: { currency: 'eur' },
                chart_stage: {},
            },
            definitions,
            dashboardValues: { currency: 'eur' },
            excludedKeys: [],
        });
        expect(items).toEqual([
            {
                key: 'currency',
                label: 'Currency',
                value: 'eur',
                source: DashboardTileParameterSource.DASHBOARD,
                sourceLabel: null,
            },
        ]);
    });

    it('names each node when nodes ran a parameter with different values', () => {
        // Excluded from the dashboard value: the semantic node keeps its saved
        // value, the DuckDB node falls back to the default
        const items = getComposerTileParameterItems({
            nodes: [orders, tagged],
            usedParameterValuesByNodeId: {
                orders: { region: 'EU' },
                tagged: { region: 'US' },
            },
            definitions,
            dashboardValues: { region: 'UK' },
            excludedKeys: ['region'],
        });
        expect(
            items.map(({ sourceLabel, value, source }) => [
                sourceLabel,
                value,
                source,
            ]),
        ).toEqual([
            ['Orders', 'EU', DashboardTileParameterSource.CHART],
            ['Tagged', 'US', DashboardTileParameterSource.DEFAULT],
        ]);
    });
});
