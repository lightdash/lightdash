import { type ComposerChartWithDetails } from '@lightdash/common';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { type FC, type ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { ComposerChartPage } from './ComposerChartPage';

const mocks = vi.hoisted(() => ({ flagOn: false, canWrite: false }));

vi.mock('../../../api');
vi.mock(
    '../../../hooks/useServerOrClientFeatureFlag',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useServerFeatureFlag: () => ({
            isLoading: false,
            data: { enabled: mocks.flagOn },
        }),
    }),
);
vi.mock(
    '../../../ee/features/aiCopilot/hooks/useRefreshComposerChartOnAgentEdit',
    () => ({ useRefreshComposerChartOnAgentEdit: () => {} }),
);
vi.mock('../hooks/useCanWriteComposerChart', () => ({
    useCanWriteComposerChart: () => mocks.canWrite,
}));
vi.mock('../hooks/useComposerChartPage', () => ({
    useComposerChartPageRun: () => ({
        runQuery: {
            isFetching: false,
            isLoading: false,
            isPreviousData: false,
            error: null,
        },
        run: { usedParameterValuesByNodeId: {}, fields: {}, queries: [] },
        refresh: () => {},
    }),
    useComposerChartParameters: () => ({
        data: { parameterReferences: [], parameterDefinitions: {} },
        isError: false,
        isInitialLoading: false,
    }),
}));
vi.mock('../hooks/useComposerChartDraw', () => ({
    COMPOSER_CHART_SENTRY_TAGS: {},
    useComposerChartDraw: () => ({
        draw: { chartConfig: { type: 'cartesian', config: {} } },
        results: { hasFetchedAllRows: true, totalResults: 1 },
        rows: [],
        displayedQueryUuid: 'query-uuid',
        error: null,
    }),
}));
vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentButton',
    () => ({
        AskAiAgentButton: () => null,
    }),
);
vi.mock('../../../components/SavedDashboards/AddTilesToDashboardModal', () => ({
    default: (({ uuid, dashboardTileType }) => (
        <div>
            Add {dashboardTileType} {uuid} to a dashboard
        </div>
    )) as FC<{ uuid: string; dashboardTileType: string }>,
}));
vi.mock('./ComposerChartVisualization', () => ({
    ComposerChartVisualization: () => <div>Drawn chart</div>,
}));
// Renders the chart it is handed, so a duplicate chart in Lineage would show
vi.mock('./ComposerTileLineage', () => ({
    ComposerTileLineage: (({ chart }) => (
        <div>
            Lineage graph
            {chart}
        </div>
    )) as FC<{ chart: ReactNode | null }>,
}));

const chart = {
    uuid: 'chart-uuid',
    versionUuid: 'version-uuid',
    slug: 'revenue',
    name: 'Revenue',
    description: null,
    space: { uuid: 'space-uuid', name: 'Orders' },
    updatedByUser: null,
    updatedAt: new Date(),
    pipeline: { schemaVersion: 1, terminalNodeId: 'orders', nodes: [] },
    chart: { chartConfig: { type: 'cartesian', config: {} } },
} as unknown as ComposerChartWithDetails;

const renderPage = () =>
    renderWithProviders(
        <MemoryRouter>
            <ComposerChartPage projectUuid="project-uuid" chart={chart} />
        </MemoryRouter>,
    );

describe('ComposerChartPage', () => {
    afterEach(() => {
        cleanup();
        mocks.flagOn = false;
        mocks.canWrite = false;
    });

    const openActions = async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Chart actions' }));
        await screen.findByRole('menu');
    };

    it('adds the chart to a dashboard from the actions menu', async () => {
        mocks.flagOn = true;
        mocks.canWrite = true;
        renderPage();
        await openActions();
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Add to dashboard' }),
        );
        expect(
            screen.getByText('Add composer_chart chart-uuid to a dashboard'),
        ).toBeInTheDocument();
    });

    it('offers no "Add to dashboard" with composer charts off', async () => {
        mocks.canWrite = true;
        renderPage();
        await openActions();
        expect(
            screen.getByRole('menuitem', { name: 'Rename' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Add to dashboard' }),
        ).not.toBeInTheDocument();
    });

    it('draws the chart once, with the lineage in its own card below', () => {
        renderPage();
        expect(screen.getByText('Drawn chart')).toBeInTheDocument();
        expect(screen.queryByText('Lineage graph')).not.toBeInTheDocument();

        fireEvent.click(screen.getByText('Lineage'));
        expect(screen.getByText('Lineage graph')).toBeInTheDocument();
        expect(screen.getAllByText('Drawn chart')).toHaveLength(1);
    });
});
