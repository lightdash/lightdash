import {
    ChartType,
    DashboardTileTypes,
    type DashboardComposerChartTile as ComposerChartTile,
} from '@lightdash/common';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardTestStore } from '../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../testing/testUtils';
import DashboardComposerChartTile from './DashboardComposerChartTile';

const drawMocks = vi.hoisted(() => ({
    chartType: 'cartesian' as string,
    hasFetchedAllRows: true,
    chartError: null as null | {
        error: { statusCode: number; message: string };
    },
    savedTileUuids: ['tile-uuid'],
    runEnabled: [] as boolean[],
}));

vi.mock('../../../api');
vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<object>()),
    getComposerChartDraw: () => ({
        chartConfig: { type: drawMocks.chartType, config: {} },
        metricQuery: {},
        fields: {},
        columnOrder: [],
        pivotColumns: [],
    }),
    getComposerChartDisplayedQueryUuid: () => 'query-uuid',
    pickComposerChartRows: () => [],
}));
vi.mock(
    '../../../hooks/useServerOrClientFeatureFlag',
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        useServerFeatureFlag: () => ({
            isLoading: false,
            data: { enabled: true },
        }),
    }),
);
vi.mock('../hooks/useComposerChartRun', () => ({
    useComposerChart: () =>
        drawMocks.chartError
            ? { data: undefined, error: drawMocks.chartError }
            : {
                  data: {
                      versionUuid: 'v1',
                      pipeline: { terminalNodeId: 'n1', nodes: [] },
                  },
                  error: null,
              },
    useComposerChartRun: ({ enabled }: { enabled: boolean }) => {
        drawMocks.runEnabled.push(enabled);
        return {
            data: {
                queries: [{ nodeId: 'n1', queryUuid: 'query-uuid' }],
                fields: {},
                sqlColumns: [],
                parameterReferences: [],
                appliedDashboardFiltersByNodeId: {},
                usedParameterValuesByNodeId: {},
            },
            error: null,
        };
    },
}));
vi.mock('../../../hooks/useQueryResults', () => ({
    useInfiniteQueryResults: () => ({
        queryUuid: 'query-uuid',
        columns: {},
        rows: [],
        totalResults: 0,
        hasFetchedAllRows: drawMocks.hasFetchedAllRows,
        fetchAll: true,
        setFetchAll: () => {},
        isFetchingRows: false,
        error: null,
    }),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-uuid',
}));
vi.mock('../../../hooks/dashboard/useDashboardFiltersForTile', () => ({
    default: () => ({ dimensions: [], metrics: [], tableCalculations: [] }),
}));
vi.mock('../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            dashboard: {
                uuid: 'dashboard-uuid',
                slug: 'dashboard',
                tiles: drawMocks.savedTileUuids.map((uuid) => ({
                    uuid,
                    type: 'composer_chart',
                    properties: { composerChartUuid: 'composer-chart-uuid' },
                })),
            },
            projectUuid: 'project-uuid',
            hasTileComments: () => false,
            dashboardTiles: [],
            dashboardTabs: [],
        }),
    ),
}));
vi.mock('../../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: vi.fn((selector: (value: Record<string, unknown>) => unknown) =>
        selector({
            markTileScreenshotErrored: () => {},
            markTileScreenshotReady: () => {},
        }),
    ),
}));
vi.mock('./ComposerChartVisualization', () => ({
    ComposerChartVisualization: () => null,
}));
vi.mock('./ComposerTileLineagePanel', () => ({
    ComposerTileLineagePanel: () => null,
}));
vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentButton',
    () => ({ AskAiAgentButton: () => null }),
);
vi.mock(
    '../../../ee/features/aiCopilot/components/AskAiAgentMenuItem/AskAiAgentMenuItem',
    () => ({ AskAiAgentMenuItem: () => null }),
);

const tile: ComposerChartTile = {
    uuid: 'tile-uuid',
    type: DashboardTileTypes.COMPOSER_CHART,
    x: 0,
    y: 0,
    h: 3,
    w: 3,
    tabUuid: undefined,
    properties: {
        title: 'Revenue',
        hideTitle: false,
        composerChartUuid: 'composer-chart-uuid',
        chartName: 'Revenue',
    },
} as ComposerChartTile;

const canExportCsv = {
    abilityRules: [{ action: 'manage', subject: 'ExportCsv' }],
};

const openMenu = async (
    { minimal = false, user = canExportCsv } = {} as {
        minimal?: boolean;
        user?: { abilityRules: { action: string; subject: string }[] };
    },
) => {
    renderWithProviders(
        <DashboardStoreTestProvider store={createDashboardTestStore({})}>
            <DashboardComposerChartTile
                tile={tile}
                isEditMode={false}
                minimal={minimal}
                onEdit={() => {}}
                onDelete={() => {}}
            />
        </DashboardStoreTestProvider>,
        { user: user as never },
    );
    fireEvent.click(await screen.findByTestId('tile-icon-more'));
    await screen.findByRole('menu');
};

const exportImageItem = () =>
    screen.queryByRole('menuitem', { name: 'Export image' });

describe('DashboardComposerChartTile "Export image"', () => {
    afterEach(() => {
        cleanup();
        drawMocks.hasFetchedAllRows = true;
    });

    it.each([ChartType.CARTESIAN, ChartType.PIE, ChartType.FUNNEL])(
        'offers it for an ECharts %s chart',
        async (chartType) => {
            drawMocks.chartType = chartType;
            await openMenu();
            expect(exportImageItem()).toBeInTheDocument();
        },
    );

    it.each([
        ChartType.TABLE,
        ChartType.BIG_NUMBER,
        ChartType.CUSTOM,
        ChartType.DATA_APP_VIZ,
    ])('does not offer it for a %s chart', async (chartType) => {
        drawMocks.chartType = chartType;
        await openMenu();
        expect(exportImageItem()).toBeNull();
    });

    it('does not offer it without permission to export data', async () => {
        drawMocks.chartType = ChartType.CARTESIAN;
        await openMenu({ user: { abilityRules: [] } });
        expect(exportImageItem()).toBeNull();
    });

    it('does not offer it on a minimal dashboard', async () => {
        drawMocks.chartType = ChartType.CARTESIAN;
        await openMenu({ minimal: true });
        expect(exportImageItem()).toBeNull();
    });

    it('does not offer it while the chart rows are loading', async () => {
        drawMocks.chartType = ChartType.CARTESIAN;
        drawMocks.hasFetchedAllRows = false;
        await openMenu();
        expect(exportImageItem()).toBeNull();
    });

    it('opens the image export options', async () => {
        drawMocks.chartType = ChartType.CARTESIAN;
        await openMenu();
        fireEvent.click(exportImageItem()!);
        expect(await screen.findByText('Export Image')).toBeInTheDocument();
    });
});

describe('DashboardComposerChartTile with a deleted chart', () => {
    afterEach(() => {
        cleanup();
        drawMocks.chartError = null;
    });

    const renderTile = () =>
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore({})}>
                <DashboardComposerChartTile
                    tile={tile}
                    isEditMode={false}
                    onEdit={() => {}}
                    onDelete={() => {}}
                />
            </DashboardStoreTestProvider>,
        );

    // As a classic tile: the dashboard was read before the chart went away
    it('shows the deleted-chart state when the chart read finds no chart', async () => {
        drawMocks.chartError = {
            error: {
                statusCode: 404,
                message: "Couldn't find access context for space space-uuid",
            },
        };
        renderTile();
        expect(
            await screen.findByText('This chart has been deleted.'),
        ).toBeInTheDocument();
        expect(screen.queryByText(/space-uuid/)).toBeNull();
    });

    it("shows the server's refusal when the chart is not viewable", async () => {
        drawMocks.chartError = {
            error: {
                statusCode: 403,
                message:
                    "You don't have permission to view this composer chart",
            },
        };
        renderTile();
        expect(
            await screen.findByText(
                "You don't have permission to view this composer chart",
            ),
        ).toBeInTheDocument();
    });

    it('shows the deleted-chart state when the chart is in Recently deleted', async () => {
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore({})}>
                <DashboardComposerChartTile
                    tile={{
                        ...tile,
                        properties: { ...tile.properties, chartName: null },
                    }}
                    isEditMode={false}
                    onEdit={() => {}}
                    onDelete={() => {}}
                />
            </DashboardStoreTestProvider>,
        );
        expect(
            await screen.findByText('This chart has been deleted.'),
        ).toBeInTheDocument();
    });
});

describe('DashboardComposerChartTile before the dashboard is saved', () => {
    afterEach(() => {
        cleanup();
        drawMocks.savedTileUuids = ['tile-uuid'];
        drawMocks.runEnabled = [];
    });

    // The server runs only tiles it has stored, so an unsaved tile would fail
    it('asks to save instead of running a tile the saved dashboard lacks', async () => {
        drawMocks.savedTileUuids = [];
        drawMocks.runEnabled = [];
        renderWithProviders(
            <DashboardStoreTestProvider store={createDashboardTestStore({})}>
                <DashboardComposerChartTile
                    tile={tile}
                    isEditMode
                    onEdit={() => {}}
                    onDelete={() => {}}
                />
            </DashboardStoreTestProvider>,
        );
        expect(
            await screen.findByText('Save the dashboard to show this chart'),
        ).toBeInTheDocument();
        expect(drawMocks.runEnabled).not.toContain(true);
    });
});
