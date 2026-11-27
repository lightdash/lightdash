import {
    QuerySourceType,
    type ComposerChartPipelineNode,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getComposerChartParameterValues } from './composerChartParameterValues';

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

describe('getComposerChartParameterValues', () => {
    it('starts each control at the value its first node ran with', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders, tagged],
                // The run applied the node's saved region over the default US
                usedParameterValuesByNodeId: {
                    orders: { region: 'EU' },
                    tagged: { region: 'US', currency: 'eur' },
                },
                picks: {},
            }),
        ).toEqual({ region: 'EU', currency: 'eur' });
    });

    it('shows a pick over the value the run used', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders, tagged],
                usedParameterValuesByNodeId: { orders: { region: 'EU' } },
                picks: { region: 'UK' },
            }),
        ).toEqual({ region: 'UK' });
    });

    it('shows nothing before the first run', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders],
                usedParameterValuesByNodeId: null,
                picks: {},
            }),
        ).toEqual({});
    });
});
