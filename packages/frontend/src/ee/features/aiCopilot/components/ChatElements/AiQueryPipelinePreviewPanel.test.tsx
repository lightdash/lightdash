import { QuerySourceType, type SourceQuery } from '@lightdash/common';
import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ChartColorMappingContextProvider from '../../../../../hooks/useChartColorConfig/ChartColorMappingContextProvider';
import mockIntersectingObserver from '../../../../../testing/intersectingObserver';
import { renderWithProviders } from '../../../../../testing/testUtils';
import { AiQueryPipelinePreviewPanel } from './AiQueryPipelinePreviewPanel';

const mocks = vi.hoisted(() => ({
    pipeline: vi.fn(),
    vizQuery: vi.fn(),
    results: vi.fn(),
}));

vi.mock('../../../../../api');
vi.mock('../../hooks/useAiAgentNodeCitations', () => ({
    useAiAgentNodeCitationPipeline: mocks.pipeline,
    useAiAgentNodeCitationVizQuery: mocks.vizQuery,
}));
vi.mock('../../../../../hooks/useQueryResults', async (original) => ({
    ...(await original<object>()),
    useInfiniteQueryResults: mocks.results,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isLoading: false,
        data: { enabled: false },
    }),
}));
vi.mock('../../store/hooks', () => ({
    useAiAgentStoreDispatch: () => vi.fn(),
    useAiAgentStoreSelector: () => [],
}));
vi.mock('../../../../../hooks/useCompiledSql', () => ({
    useCompiledSqlFromMetricQuery: vi.fn(() => ({ data: undefined })),
}));
vi.mock('../../../../../hooks/useExplore', () => ({
    useExploreByProjectUuid: vi.fn(() => ({ data: undefined })),
}));
vi.mock(
    '../../../../../features/externalConnections/liveSources/apiSourceExplore',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useLiveSourceExplore: vi.fn(() => null),
    }),
);

beforeAll(mockIntersectingObserver);
beforeAll(() => {
    window.Element.prototype.scrollTo = vi.fn();
});

const orders: SourceQuery = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'orders',
    title: 'Orders',
    sql: 'select 1',
};
const net: SourceQuery = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'net',
    title: 'Net orders',
    sql: 'select 1',
    references: ['orders'],
};

const preview = {
    projectUuid: 'project',
    agentUuid: 'agent',
    threadUuid: 'thread',
    messageUuid: 'message',
    nodeId: 'net',
};

const panelFor = (pipelinePreview: typeof preview) => (
    <MemoryRouter>
        <ChartColorMappingContextProvider>
            <AiQueryPipelinePreviewPanel pipelinePreview={pipelinePreview} />
        </ChartColorMappingContextProvider>
    </MemoryRouter>
);
const renderPanel = (pipelinePreview = preview) =>
    renderWithProviders(panelFor(pipelinePreview));

const queryResultsOf = (reference: string) => ({
    rows: [{ [reference]: { value: { raw: 1, formatted: '1' } } }],
    columns: { [reference]: { reference, type: 'number' } },
    hasFetchedAllRows: true,
    fetchAll: true,
    setFetchAll: vi.fn(),
    isInitialLoading: false,
    isFetchingFirstPage: false,
    isFetchingRows: false,
    isFetchingAllPages: false,
    totalRows: 1,
    error: null,
});

describe('AiQueryPipelinePreviewPanel', () => {
    beforeEach(() => {
        mocks.pipeline.mockReturnValue({
            data: { nodeId: 'net', title: 'Net orders', nodes: [orders, net] },
            isInitialLoading: false,
            refetch: vi.fn(),
        });
        mocks.vizQuery.mockReturnValue({
            data: {
                source: 'composer',
                terminalNodeId: 'net',
                nodeQueryUuids: { orders: 'orders-run', net: 'net-run' },
                metadata: { title: 'Net orders', description: null },
                chartStage: null,
            },
            error: null,
            refetch: vi.fn(),
        });
        mocks.results.mockImplementation(
            (_project: string, queryUuid: string | undefined) =>
                queryResultsOf(queryUuid === 'net-run' ? 'net_total' : 'other'),
        );
    });

    it('shows the cited node result in the Chart view', () => {
        renderPanel();

        fireEvent.click(screen.getByRole('radio', { name: 'Chart' }));

        expect(
            screen.getByRole('columnheader', { name: 'Net total' }),
        ).toBeInTheDocument();
    });

    it('opens on the Lineage with the cited node as the final result', () => {
        renderPanel();

        expect(screen.getByRole('radio', { name: 'Lineage' })).toBeChecked();
        const netCell = within(
            document.querySelector<HTMLElement>('[data-node-id="net"]')!,
        );
        expect(netCell.getByText('Final result')).toBeInTheDocument();
        expect(
            document.querySelector('[data-node-id="orders"]'),
        ).toBeInTheDocument();
    });

    it('returns to the Lineage when another node is cited', () => {
        const { rerender } = renderPanel();
        fireEvent.click(screen.getByRole('radio', { name: 'Chart' }));

        rerender(panelFor({ ...preview, nodeId: 'orders' }));

        expect(screen.getByRole('radio', { name: 'Lineage' })).toBeChecked();
    });

    it('shows the load error when the node cannot be read', () => {
        mocks.pipeline.mockReturnValue({
            data: undefined,
            isInitialLoading: false,
            refetch: vi.fn(),
        });
        renderPanel();

        expect(
            screen.getByText('Could not load this query.'),
        ).toBeInTheDocument();
    });
});
