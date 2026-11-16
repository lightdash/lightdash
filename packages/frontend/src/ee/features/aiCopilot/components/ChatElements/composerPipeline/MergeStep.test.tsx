import {
    MergeJoinType,
    QuerySourceType,
    type MergeSourceQuery,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { type PipelineNode } from './groupPipeline';
import { summarizeMergeNode } from './mergeNodeSummary';
import { MergeStepBody } from './MergeStep';
import { MergeStepProvider } from './MergeStepParts';
import { type MergeNodeView } from './notebook/useMergeNodeView';

const LABELS: Record<string, string> = {
    orders_partner: 'Partner name',
    orders_month: 'Order date month',
    orders_revenue: 'Revenue',
    deliveries_partner: 'Partner name',
    deliveries_month: 'Order day month',
    deliveries_revenue: 'Revenue',
};

const step = (nodeId: string, title: string): PipelineNode => ({
    nodeId,
    title,
    description: null,
    isTerminal: false,
    depth: 0,
    readNodeIds: [],
    query: {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        exploreName: nodeId,
        dimensions: [],
        metrics: [],
    } satisfies SemanticLayerSourceQuery,
});

const steps = [step('orders', 'This year'), step('deliveries', 'Last year')];

const merge = (sameMonthName: boolean): MergeSourceQuery => ({
    sourceType: QuerySourceType.MERGE,
    sources: [{ nodeId: 'orders' }, { nodeId: 'deliveries' }],
    joinKey: [
        {
            name: 'partner',
            fieldIdBySourceId: {
                orders: 'orders_partner',
                deliveries: 'deliveries_partner',
            },
        },
        {
            name: 'month',
            fieldIdBySourceId: {
                orders: 'orders_month',
                deliveries: sameMonthName ? 'orders_month' : 'deliveries_month',
            },
        },
    ],
    joinType: MergeJoinType.LEFT,
    tableCalculations: [
        {
            name: 'yoy',
            displayName: 'Revenue change',
            sql: '',
            formula: '=orders_orders_revenue / deliveries_deliveries_revenue',
        },
    ],
});

const renderStep = (query: MergeSourceQuery) => {
    const view: MergeNodeView = {
        summary: summarizeMergeNode(
            query,
            {
                orders: { title: 'This year', exploreName: 'orders' },
                deliveries: { title: 'Last year', exploreName: 'deliveries' },
            },
            (_nodeId, fieldId) => LABELS[fieldId] ?? fieldId,
        ),
        fieldsMapBySource: {},
        exploreLabelBySource: {},
    };
    return renderWithProviders(
        <MergeStepProvider
            view={view}
            references={steps}
            onJump={vi.fn()}
            onHighlightNode={vi.fn()}
        >
            <MergeStepBody view={view} />
        </MergeStepProvider>,
    );
};

describe('MergeStepBody', () => {
    it('reads the join as one sentence, the kept step first', () => {
        renderStep(merge(true));
        const pills = screen.getAllByRole('button', { name: /year/ });
        expect(pills.map((pill) => pill.textContent)).toEqual([
            'AThis year',
            'BLast year',
        ]);
        expect(screen.getByText('Left join')).toBeInTheDocument();
        expect(screen.getByText(/^with$/)).toBeInTheDocument();
        expect(screen.queryByText('Join key')).not.toBeInTheDocument();
    });

    it("lists the fields a step joins on by that step's own names", async () => {
        renderStep(merge(false));
        expect(screen.queryByText('Order day month')).not.toBeInTheDocument();
        fireEvent.focus(screen.getByRole('button', { name: /Last year/ }));
        expect(
            await screen.findByText('Joins on Partner name, Order day month'),
        ).toBeInTheDocument();
    });

    it("marks each column in a calculation with its step's letter", () => {
        renderStep(merge(true));
        const calculation = screen.getByTestId('merge-node-calculation');
        expect(
            within(calculation)
                .getAllByText('Revenue')
                .map((label) => label.parentElement?.textContent),
        ).toEqual(['ARevenue', 'BRevenue']);
    });
});
