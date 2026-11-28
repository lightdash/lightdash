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
                isRunCurrent: true,
            }),
        ).toEqual({ region: 'EU', currency: 'eur' });
    });

    it('shows a pick over the previous run while its run is pending', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders, tagged],
                usedParameterValuesByNodeId: { orders: { region: 'EU' } },
                picks: { region: 'UK' },
                isRunCurrent: false,
            }),
        ).toEqual({ region: 'UK' });
    });

    it('shows a pick one node ran even when another node kept its own value', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders, tagged],
                usedParameterValuesByNodeId: {
                    orders: { region: 'EU' },
                    tagged: { region: 'CA' },
                },
                picks: { region: 'CA' },
                isRunCurrent: true,
            }),
        ).toEqual({ region: 'CA' });
    });

    it('shows the value the run applied over a pick it dropped', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders, tagged],
                usedParameterValuesByNodeId: { orders: { region: 'EU' } },
                picks: { region: 'not-an-option' },
                isRunCurrent: true,
            }),
        ).toEqual({ region: 'EU' });
    });

    it('shows nothing before the first run', () => {
        expect(
            getComposerChartParameterValues({
                nodes: [orders],
                usedParameterValuesByNodeId: null,
                picks: {},
                isRunCurrent: false,
            }),
        ).toEqual({});
    });
});
