import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    type ApiAppVersionSummary,
    type DataAppViz,
    type DataAppVizContext,
    type ItemsMap,
} from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanCreateDataApp } from '../../../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../../features/apps/hooks/useCanEditDataApp';
import {
    useChartTypeBuilderWorkspace,
    type ChartTypeBuilderWorkspaceState,
} from '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace';
import { clarificationStub } from '../../../features/chartTypes/testing/clarificationRoundStub';
import { buildStub } from '../../../features/chartTypes/testing/dataAppVizBuildStub';
import {
    createExplorerStore,
    explorerActions,
} from '../../../features/explorer/store';
import { ChartColorMappingContext } from '../../../hooks/useChartColorConfig/context';
import { renderWithProviders } from '../../../testing/testUtils';
import { useExplorerResultsData } from '../VisualizationCard/useExplorerResultsData';
import ExplorerChartTypeAuthoring from './ExplorerChartTypeAuthoring';

const {
    showToastError,
    showToastSuccess,
    setFetchAll,
    previewContexts,
    deleteApp,
} = vi.hoisted(() => ({
    showToastError: vi.fn(),
    showToastSuccess: vi.fn(),
    setFetchAll: vi.fn(),
    previewContexts: [] as (DataAppVizContext | null)[],
    deleteApp: vi.fn(),
}));

vi.mock(
    '../../../features/chartTypes/builder/useChartTypeBuilderWorkspace',
    () => ({
        useChartTypeBuilderWorkspace: vi.fn(),
    }),
);
vi.mock('../VisualizationCard/useExplorerResultsData', () => ({
    useExplorerResultsData: vi.fn(),
}));
vi.mock('../VisualizationCard/useExplorerChartColorPalette', () => ({
    useExplorerChartColorPalette: () => ['#explorer-1', '#explorer-2'],
}));
const { dataAppsEnabled } = vi.hoisted(() => ({
    dataAppsEnabled: { current: true },
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: dataAppsEnabled.current },
        isLoading: false,
    }),
}));
vi.mock('../../../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(() => true),
}));
vi.mock('../../../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(() => true),
}));
vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../../features/apps/hooks/useDeleteApp', () => ({
    useDeleteApp: () => ({ mutate: deleteApp }),
}));
vi.mock('../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastError, showToastSuccess }),
}));
vi.mock(
    '../../../features/chartTypes/builder/ChartTypeBuilderWorkspace',
    () => ({
        default: ({
            previewContext,
        }: {
            previewContext: DataAppVizContext | null;
        }) => {
            previewContexts.push(previewContext);
            return <div data-testid="workspace" />;
        },
    }),
);
// The modal's config column needs the chart card's viz context, which this
// container test does not mount.
vi.mock(
    '../../VisualizationConfigs/DataAppVizConfig/DataAppVizConfigTabs',
    () => ({
        ConfigTabs: () => <div data-testid="config-tabs" />,
    }),
);

const itemsMap = {
    orders_status: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    },
    orders_region: {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'region',
        label: 'Region',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.region',
        hidden: false,
    },
    orders_count: {
        fieldType: FieldType.METRIC,
        type: MetricType.COUNT,
        name: 'count',
        label: 'Count',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.id',
        hidden: false,
    },
} satisfies ItemsMap;

const rows = [{ orders_status: { value: { raw: 'new', formatted: 'New' } } }];

const dataAppViz = {
    dataAppVizUuid: 'viz-1',
    name: 'Grouped bars',
    description: '',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: {
        fields: [
            {
                name: 'category',
                label: 'Category',
                type: 'dimension',
                required: true,
            },
            { name: 'value', label: 'Value', type: 'metric', required: true },
        ],
        configOptions: [
            {
                type: 'boolean',
                name: 'showLegend',
                label: 'Show legend',
                default: true,
            },
        ],
        colorPalette: null,
    },
    createdAt: new Date('2026-08-19T00:00:00Z'),
    createdByUserUuid: 'user-1',
    registrySlug: null,
} satisfies DataAppViz;

const readyVersion = {
    version: 1,
    status: 'ready',
    createdAt: new Date('2026-08-19T00:00:00Z'),
} as ApiAppVersionSummary;

const workspaceStub = (
    overrides: Partial<ChartTypeBuilderWorkspaceState> = {},
): ChartTypeBuilderWorkspaceState => ({
    dataAppVizUuid: 'viz-1',
    build: buildStub(),
    clarification: clarificationStub(),
    history: {
        versions: [readyVersion],
        oldest: readyVersion,
        latest: readyVersion,
        latestReadyVersion: 1,
        hasOrigin: true,
        hasEarlier: false,
        isLoading: false,
        isError: false,
        isFetchingEarlier: false,
        fetchEarlier: vi.fn(),
    },
    modelSelection: {} as ChartTypeBuilderWorkspaceState['modelSelection'],
    isBuilding: false,
    buildingPrompt: null,
    elapsed: null,
    narration: {} as ChartTypeBuilderWorkspaceState['narration'],
    onCancelBuild: null,
    failureMessage: null,
    isClarifyRoundOpen: false,
    previewVersion: 1,
    viewedVersion: null,
    onViewVersion: vi.fn(),
    dataAppViz,
    isFetchingSchema: false,
    hasHistory: true,
    isHistoryOpen: false,
    openHistory: vi.fn(),
    closeHistory: vi.fn(),
    toggleHistory: vi.fn(),
    isPromptBarMounted: true,
    promptSessionKey: 'viz-1',
    composerAppUuid: 'viz-1',
    sdkUpgradeOffer: {
        status: 'unknown',
    } as ChartTypeBuilderWorkspaceState['sdkUpgradeOffer'],
    onSdkManifest: vi.fn(),
    promptBarRef: { current: null },
    onPickExample: null,
    ...overrides,
});

const newTypeWorkspace = () =>
    workspaceStub({
        dataAppVizUuid: null,
        dataAppViz: undefined,
        previewVersion: null,
        hasHistory: false,
        history: {
            ...workspaceStub().history,
            versions: [],
            oldest: null,
            latest: null,
            latestReadyVersion: null,
            hasOrigin: false,
        },
    });

const renderAuthoring = ({
    dataAppVizUuid = 'viz-1' as string | null,
    claimedUuid = null as string | null,
    step = 'choose' as 'choose' | 'configure',
    chartConfig = null as null | {
        dataAppVizUuid: string;
        fieldMapping: Record<string, string>;
        optionValues: Record<string, unknown>;
    },
} = {}) => {
    const store = createExplorerStore();
    store.dispatch(explorerActions.openVisualizationConfig());
    store.dispatch(explorerActions.setChartSidebarStep(step));
    if (chartConfig) {
        store.dispatch(
            explorerActions.setChartConfig({
                chartConfig: {
                    type: ChartType.DATA_APP_VIZ,
                    config: chartConfig as never,
                },
            }),
        );
    }
    store.dispatch(explorerActions.startChartTypeAuthoring({ dataAppVizUuid }));
    if (claimedUuid) {
        store.dispatch(explorerActions.claimChartTypeAuthoringViz(claimedUuid));
    }

    const Harness = () => {
        const authoring = store.getState().explorer.chartTypeAuthoring;
        return authoring ? (
            <ExplorerChartTypeAuthoring authoring={authoring} />
        ) : (
            <div>explorer</div>
        );
    };

    renderWithProviders(
        <ChartColorMappingContext.Provider value={{ colorMappings: new Map() }}>
            <Provider store={store}>
                <MemoryRouter>
                    <Harness />
                </MemoryRouter>
            </Provider>
        </ChartColorMappingContext.Provider>,
    );
    return store;
};

describe('ExplorerChartTypeAuthoring', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        previewContexts.length = 0;
        dataAppsEnabled.current = true;
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            workspaceStub(),
        );
        vi.mocked(useExplorerResultsData).mockReturnValue({
            resultsData: {
                rows,
                fields: itemsMap,
                pivotDetails: null,
                setFetchAll,
            },
        } as unknown as ReturnType<typeof useExplorerResultsData>);
    });

    it('binds the chart to the type once its schema is known', () => {
        const store = renderAuthoring();

        // Builds from this host carry the explorer's analytics source.
        expect(useChartTypeBuilderWorkspace).toHaveBeenCalledWith(
            expect.objectContaining({
                creationExperience: 'explorer_chart_config',
            }),
        );

        expect(
            store.getState().explorer.unsavedChartVersion.chartConfig,
        ).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'viz-1',
                fieldMapping: {
                    category: 'orders_status',
                    value: 'orders_count',
                },
                optionValues: {},
            },
        });
        expect(store.getState().explorer.chartSidebarStep).toBe('configure');
    });

    it('waits for the query fields before binding the chart to the type', () => {
        vi.mocked(useExplorerResultsData).mockReturnValue({
            resultsData: {
                rows: [],
                fields: undefined,
                pivotDetails: null,
                setFetchAll,
            },
        } as unknown as ReturnType<typeof useExplorerResultsData>);
        const store = renderAuthoring();

        expect(
            store.getState().explorer.unsavedChartVersion.chartConfig.type,
        ).not.toBe(ChartType.DATA_APP_VIZ);

        vi.mocked(useExplorerResultsData).mockReturnValue({
            resultsData: {
                rows,
                fields: itemsMap,
                pivotDetails: null,
                setFetchAll,
            },
        } as unknown as ReturnType<typeof useExplorerResultsData>);
        // The mocked results hook cannot re-render the component itself;
        // re-dispatching the untouched chart config stands in for it.
        const currentConfig =
            store.getState().explorer.unsavedChartVersion.chartConfig;
        act(() => {
            store.dispatch(
                explorerActions.setChartConfig({
                    chartConfig: currentConfig as never,
                }),
            );
        });

        expect(
            store.getState().explorer.unsavedChartVersion.chartConfig,
        ).toEqual({
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: 'viz-1',
                fieldMapping: {
                    category: 'orders_status',
                    value: 'orders_count',
                },
                optionValues: {},
            },
        });
    });

    it('previews the chart binding against every Explorer row with the chart palette', () => {
        renderAuthoring();

        expect(setFetchAll).toHaveBeenCalledWith(true);
        const context = previewContexts.at(-1);
        expect(context?.rows).toBe(rows);
        expect(context?.fieldMapping).toEqual({
            category: 'orders_status',
            value: 'orders_count',
        });
        expect(context?.colorPalette).toEqual(['#explorer-1', '#explorer-2']);
        expect(context?.underlyingData).toEqual({ enabled: false });
    });

    it('keeps the binding and options the chart already has for this type', () => {
        renderAuthoring({
            chartConfig: {
                dataAppVizUuid: 'viz-1',
                fieldMapping: { category: 'orders_region' },
                optionValues: { showLegend: false },
            },
        });

        const context = previewContexts.at(-1);
        expect(context?.fieldMapping.category).toBe('orders_region');
        expect(context?.options).toEqual({ showLegend: false });
    });

    it('puts the chart back and returns to the prior step when nothing was built', async () => {
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            newTypeWorkspace(),
        );
        const store = renderAuthoring({ dataAppVizUuid: null, step: 'choose' });
        expect(
            store.getState().explorer.unsavedChartVersion.chartConfig.type,
        ).toBe(ChartType.DATA_APP_VIZ);

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );

        const { explorer } = store.getState();
        expect(explorer.chartTypeAuthoring).toBeNull();
        expect(explorer.isVisualizationConfigOpen).toBe(true);
        expect(explorer.chartSidebarStep).toBe('choose');
        expect(explorer.unsavedChartVersion.chartConfig.type).toBe(
            ChartType.CARTESIAN,
        );
    });

    it('discards a first build still running when done early', async () => {
        const discard = vi.fn();
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            workspaceStub({
                ...newTypeWorkspace(),
                isBuilding: true,
                build: buildStub({
                    isBuilding: true,
                    draft: {
                        appUuid: 'viz-new',
                        version: 1,
                        startedAt: new Date(),
                    },
                    discard,
                }),
            }),
        );
        renderAuthoring({ dataAppVizUuid: null });

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );
        expect(discard).not.toHaveBeenCalled();
        expect(
            screen.getByText(
                'Leaving now discards the build that is still running.',
            ),
        ).toBeInTheDocument();

        await userEvent.click(
            screen.getByRole('button', { name: 'Discard and leave' }),
        );

        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('lets a revision build keep running when leaving is confirmed', async () => {
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            workspaceStub({
                isBuilding: true,
                build: buildStub({ isBuilding: true }),
            }),
        );
        const store = renderAuthoring();

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );
        expect(store.getState().explorer.chartTypeAuthoring).not.toBeNull();
        expect(
            screen.getByText(
                'The build keeps running and lands in version history when it finishes.',
            ),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Leave' }));

        expect(store.getState().explorer.chartTypeAuthoring).toBeNull();
    });

    it('finishes on Configure with the chart on the authored type', async () => {
        const store = renderAuthoring({ step: 'choose' });

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );

        const { explorer } = store.getState();
        expect(explorer.chartTypeAuthoring).toBeNull();
        expect(explorer.isVisualizationConfigOpen).toBe(true);
        expect(explorer.chartSidebarStep).toBe('configure');
        expect(explorer.unsavedChartVersion.chartConfig).toEqual(
            expect.objectContaining({ type: ChartType.DATA_APP_VIZ }),
        );
        expect(showToastSuccess).toHaveBeenCalledWith({
            title: 'Chart now uses Grouped bars v1',
        });
    });

    it('leaves a new type without a viz until it has a version', () => {
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            newTypeWorkspace(),
        );
        const store = renderAuthoring({ dataAppVizUuid: null });

        expect(
            store.getState().explorer.unsavedChartVersion.chartConfig,
        ).toStrictEqual({ type: ChartType.DATA_APP_VIZ });
        expect(previewContexts.at(-1)).toBeNull();
    });

    it('discards a type created here that never got a version when done', async () => {
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            workspaceStub({
                ...newTypeWorkspace(),
                dataAppVizUuid: 'viz-new',
            }),
        );
        renderAuthoring({ dataAppVizUuid: null, claimedUuid: 'viz-new' });

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );

        expect(deleteApp).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-1',
                appUuid: 'viz-new',
            }),
        );
    });

    it('keeps a revised type when done', async () => {
        renderAuthoring();

        await userEvent.click(
            screen.getByRole('button', { name: 'Back to chart' }),
        );

        expect(deleteApp).not.toHaveBeenCalled();
    });

    it('takes focus on entry and hands it back to the sidebar on exit', async () => {
        const sidebarTitle = document.createElement('p');
        sidebarTitle.id = 'chart-gallery-sidebar-title';
        sidebarTitle.tabIndex = -1;
        document.body.appendChild(sidebarTitle);
        try {
            renderAuthoring();
            expect(screen.getByRole('heading', { level: 2 })).toHaveFocus();

            await userEvent.click(
                screen.getByRole('button', { name: 'Back to chart' }),
            );
            await new Promise((resolve) => requestAnimationFrame(resolve));

            expect(sidebarTitle).toHaveFocus();
        } finally {
            sidebarTitle.remove();
        }
    });

    it('carries the app a first build claims into the session', () => {
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            workspaceStub({
                ...newTypeWorkspace(),
                build: buildStub({ appUuid: 'viz-new' }),
            }),
        );
        const store = renderAuthoring({ dataAppVizUuid: null });

        expect(
            store.getState().explorer.chartTypeAuthoring?.dataAppVizUuid,
        ).toBe('viz-new');
    });

    it('leaves authoring when the user may not create chart types', () => {
        vi.mocked(useCanCreateDataApp).mockReturnValue(false);
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            newTypeWorkspace(),
        );
        const store = renderAuthoring({ dataAppVizUuid: null });

        expect(showToastError).toHaveBeenCalled();
        expect(store.getState().explorer.chartTypeAuthoring).toBeNull();
    });

    it('leaves authoring when the user may not edit this type', () => {
        vi.mocked(useCanEditDataApp).mockReturnValue(false);
        const store = renderAuthoring({ dataAppVizUuid: 'viz-1' });

        expect(showToastError).toHaveBeenCalled();
        expect(store.getState().explorer.chartTypeAuthoring).toBeNull();
    });

    it('leaves authoring when data-apps is switched off under it', () => {
        dataAppsEnabled.current = false;
        const store = renderAuthoring({ dataAppVizUuid: 'viz-1' });

        expect(showToastError).toHaveBeenCalled();
        expect(store.getState().explorer.chartTypeAuthoring).toBeNull();
    });

    it('leaves authoring when the type is an official (registry-installed) chart type', () => {
        vi.mocked(useChartTypeBuilderWorkspace).mockReturnValue(
            workspaceStub({
                dataAppViz: { ...dataAppViz, registrySlug: 'radial-gauge' },
            }),
        );
        const store = renderAuthoring({ dataAppVizUuid: 'viz-1' });

        expect(showToastError).toHaveBeenCalled();
        expect(store.getState().explorer.chartTypeAuthoring).toBeNull();
    });
});
