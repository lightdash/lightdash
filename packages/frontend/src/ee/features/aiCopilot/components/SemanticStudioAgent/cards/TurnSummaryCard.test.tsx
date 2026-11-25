import {
    DimensionType,
    FieldType,
    MetricType,
    TimeFrames,
    type Explore,
    type SemanticLayerProposal,
} from '@lightdash/common';
import { act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import {
    draftModel,
    draftOf,
} from '../../../../../../features/semanticStudio/studioCheckout.mock';
import { renderWithProviders } from '../../../../../../testing/testUtils';
import { TurnSummaryCard } from './TurnSummaryCard';

const api = vi.hoisted(() => vi.fn());
vi.mock('../../../../../../providers/LightdashApi/useLightdashApi', () => ({
    useLightdashApi: () => api,
}));

const draft = vi.hoisted(() => ({ current: null as unknown }));
vi.mock(
    '../../../../../../features/semanticStudio/useSemanticLayerModel',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useSemanticLayerDraft: () => ({ data: draft.current }),
        useSemanticLayerDraftImpact: () => ({ data: undefined }),
        usePublishMode: () => 'live',
        useRefreshSemanticLayerDraft: () => vi.fn(),
    }),
);
vi.mock(
    '../../../../../../features/semanticStudio/useStudioCheckout',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useDraftPullRequest: () => null,
    }),
);
vi.mock('../useSemanticStudioChat', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    useStudioAgentWorking: () => false,
}));

const field = {
    table: 'orders',
    tableLabel: 'Orders',
    sql: 'x',
    compiledSql: 'x',
    tablesReferences: ['orders'],
    hidden: false,
};
const base = draftModel('orders', null, 'x').explore!;
const explore: Explore = {
    ...base,
    tables: {
        orders: {
            ...base.tables.orders,
            dimensions: {
                created_month: {
                    ...field,
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.DATE,
                    name: 'created_month',
                    label: 'Created month',
                    timeInterval: TimeFrames.MONTH,
                },
            },
            metrics: {
                revenue: {
                    ...field,
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'revenue',
                    label: 'Revenue',
                },
            },
        },
    },
};

const proposal: SemanticLayerProposal = {
    status: 'success',
    models: [
        {
            model: 'orders',
            status: 'ready',
            changes: [],
            refusals: [],
            error: null,
        },
    ],
    diffs: [{ model: 'orders', contentBefore: null, contentAfter: 'x' }],
    draftChangeUuid: 'change-1',
    startedChange: null,
    note: null,
    options: [],
    needsFollowUp: false,
};

describe('TurnSummaryCard', () => {
    it('never queries the warehouse on its own', async () => {
        draft.current = {
            ...draftOf([draftModel('orders', null, 'x')]),
            changes: [
                {
                    draftChangeUuid: 'change-1',
                    question: null,
                    createdAt: new Date(0),
                    models: [],
                    projectContextEntries: [],
                },
            ],
        };
        api.mockImplementation(async ({ url }: { url: string }) =>
            url.includes('runQuery') ? { rows: [] } : explore,
        );
        renderWithProviders(
            <MemoryRouter>
                <TurnSummaryCard
                    projectUuid="project"
                    proposals={[proposal]}
                    onAsk={null}
                    isLatest
                />
            </MemoryRouter>,
        );
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
        expect(
            api.mock.calls.filter(([{ url }]) => url.includes('runQuery')),
        ).toEqual([]);
    });
});
