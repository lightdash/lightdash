import {
    ChartType,
    DimensionType,
    FieldType,
    MetricType,
    MergeJoinType,
    VizAggregationOptions,
    VizIndexType,
    type ReadyQueryResultsPage,
    type DataAppVizContext,
    type DataAppVizField,
    type ItemsMap,
    FeatureFlags,
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
    type SdkFeature,
} from '@lightdash/common';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAmbientAiEnabled } from '../ee/features/ambientAi/hooks/useAmbientAiEnabled';
import { suggestChartTypeFields } from '../ee/features/ambientAi/hooks/useChartTypeSuggestions';
import {
    useAppVersionHistory,
    type AppVersionHistory,
} from '../features/apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useClarificationRound } from '../features/apps/hooks/useClarificationRound';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import {
    useSdkUpgradeStatus,
    type SdkUpgradeOffer,
} from '../features/apps/hooks/useSdkUpgradeStatus';
import { useUpgradeApp } from '../features/apps/hooks/useUpgradeApp';
import { appVersion } from '../features/apps/testing/appVersionHistory';
import {
    useAttachedExplore,
    useExplorePreviewData,
} from '../features/chartTypes/builder/useExplorePreviewData';
import { useSavedChartBindingPreview } from '../features/chartTypes/builder/useSavedChartBindingPreview';
import { useSavedChartPreviewData } from '../features/chartTypes/builder/useSavedChartPreviewData';
import { useDataAppVisualization } from '../features/chartTypes/hooks/useDataAppVisualization';
import { useDataAppVizBuild } from '../features/chartTypes/hooks/useDataAppVizBuild';
import { type VizBuildRequest } from '../features/chartTypes/hooks/useDataAppVizBuild';
import { clarificationStub } from '../features/chartTypes/testing/clarificationRoundStub';
import { buildStub } from '../features/chartTypes/testing/dataAppVizBuildStub';
import { ChartColorMappingContext } from '../hooks/useChartColorConfig/context';
import { useExplores } from '../hooks/useExplores';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import ChartTypeBuilder from './ChartTypeBuilder';

vi.mock('../ee/features/ambientAi/hooks/useAmbientAiEnabled', () => ({
    useAmbientAiEnabled: vi.fn(),
}));
vi.mock('../ee/features/ambientAi/hooks/useChartTypeSuggestions', () => ({
    suggestChartTypeFields: vi.fn(),
    useSuggestedChartTypeExplore: vi.fn(() => null),
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
}));
vi.mock('../hooks/useExplores', () => ({ useExplores: vi.fn() }));
vi.mock('../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => ({ projectUrlIdentifier: 'jaffle-shop' }),
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'p1',
}));
vi.mock('../features/apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: vi.fn(),
}));
vi.mock('../features/apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: vi.fn(),
}));
vi.mock('../features/apps/hooks/useGetApp', () => ({
    useGetApp: vi.fn(),
}));
vi.mock('../features/apps/hooks/useSdkUpgradeStatus', () => ({
    useSdkUpgradeStatus: vi.fn(),
}));
vi.mock('../features/apps/hooks/useUpgradeApp', () => ({
    useUpgradeApp: vi.fn(),
}));
vi.mock('../features/apps/hooks/useAppVersionHistory', () => ({
    useAppVersionHistory: vi.fn(),
}));
vi.mock('../features/chartTypes/hooks/useDataAppVizBuild', () => ({
    useDataAppVizBuild: vi.fn(),
}));
vi.mock('../features/chartTypes/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));
vi.mock('../features/chartTypes/builder/useExplorePreviewData', () => ({
    useAttachedExplore: vi.fn(),
    useExplorePreviewData: vi.fn(),
}));
vi.mock('../features/chartTypes/builder/useSavedChartBindingPreview', () => ({
    useSavedChartBindingPreview: vi.fn(({ source, fieldMapping }) => ({
        ...source,
        fieldMapping,
    })),
}));
vi.mock('../features/chartTypes/builder/useSavedChartPreviewData', () => ({
    useSavedChartPreviewData: vi.fn(),
}));
vi.mock('../features/apps/hooks/useClarificationRound', () => ({
    useClarificationRound: vi.fn(),
}));
vi.mock('../features/apps/hooks/useAppBuildPoller', () => ({
    useAppBuildPoller: vi.fn(),
}));
vi.mock('../features/apps/hooks/useUpdateApp', () => ({
    useUpdateApp: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));
vi.mock('../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));
vi.mock('../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('../features/apps/components/AppPreview', () => ({
    default: ({
        version,
        onSdkManifest,
        dataAppVizContext,
    }: {
        version: number;
        dataAppVizContext?: DataAppVizContext;
        onSdkManifest?: (manifest: {
            sdkVersion: string;
            features: string[];
            fixes: string[];
        }) => void;
    }) => (
        <div data-testid="app-preview">
            {`preview-v${version}`}
            <output data-testid="viz-context">
                {JSON.stringify(dataAppVizContext)}
            </output>
            <button
                type="button"
                onClick={() =>
                    onSdkManifest?.({
                        sdkVersion: '1.68.0',
                        features: ['query'],
                        fixes: [],
                    })
                }
            >
                Report SDK manifest
            </button>
        </div>
    ),
}));
vi.mock('../components/common/PromptComposer/PromptComposer', () => ({
    default: ({
        placeholder,
        disabled,
    }: {
        placeholder: string;
        disabled?: boolean;
    }) => <input placeholder={placeholder} disabled={disabled} />,
}));
vi.mock('../features/chartTypes/hooks/useVizComposerAttachments', () => ({
    useVizComposerAttachments: () => ({
        attachments: [],
        fileIds: [],
        isUploading: false,
        add: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
    }),
}));

type AppMeta = ApiGetAppResponse['results'];

const explorerChart = {
    tableName: 'orders',
    metricQuery: {
        exploreName: 'orders',
        dimensions: ['orders_status'],
        metrics: ['orders_total'],
        filters: {},
        sorts: [{ fieldId: 'orders_total', descending: true }],
        limit: 100,
        tableCalculations: [],
    },
    chartConfig: {
        type: ChartType.TABLE,
        config: { showColumnCalculation: false },
    },
    tableConfig: { columnOrder: ['orders_status', 'orders_total'] },
};

const explorerSearch = () => {
    const searchParams = new URLSearchParams({
        create_saved_chart_version: JSON.stringify(explorerChart),
        fromSpace: 'space-1',
    });
    return `?${searchParams.toString()}`;
};

const LocationDisplay = () => {
    const location = useLocation();
    return (
        <div data-testid="location">
            {`${location.pathname}${location.search}`}
        </div>
    );
};

const appMeta = (overrides: Partial<AppMeta> = {}): AppMeta =>
    ({
        appUuid: 'viz-1',
        name: 'Stream graph',
        description: 'Layered flows',
        createdByUserUuid: 'user-1',
        spaceUuid: null,
        spaceName: null,
        template: 'data_app_viz',
        pinnedListUuid: null,
        pinnedListOrder: null,
        slug: 'stream-graph',
        views: 0,
        versions: [],
        hasMore: false,
        latestReadyVersion: 1,
        registrySlug: null,
        icon: null,
        verification: null,
        ...overrides,
    }) as AppMeta;

const historyStub = (
    versions: ApiAppVersionSummary[],
    latestReadyVersion: number | null,
): AppVersionHistory => ({
    versions,
    oldest: versions.length ? versions[versions.length - 1] : null,
    latest: versions.length ? versions[0] : null,
    latestReadyVersion,
    hasOrigin: versions.some((v) => v.version === 1),
    currentThreadNumber: null,
    hasEarlier: false,
    isLoading: false,
    isError: false,
    isFetchingEarlier: false,
    fetchEarlier: vi.fn(),
});

const setFlag = (enabled: boolean) =>
    vi.mocked(useServerFeatureFlag).mockReturnValue({
        data: { id: FeatureFlags.EnableDataApps, enabled },
        isLoading: false,
    } as ReturnType<typeof useServerFeatureFlag>);

const setApp = (meta: AppMeta | null, error: unknown = null) =>
    vi.mocked(useGetApp).mockReturnValue({
        data: meta ? { pages: [meta], pageParams: [undefined] } : undefined,
        error,
    } as unknown as ReturnType<typeof useGetApp>);

const builderRoutes = (path: string) => (
    <MemoryRouter initialEntries={[path]}>
        <ChartColorMappingContext.Provider value={{ colorMappings: new Map() }}>
            <LocationDisplay />
            <Routes>
                <Route
                    path="/projects/:projectUuid/chart-types/new"
                    element={<ChartTypeBuilder />}
                />
                <Route
                    path="/projects/:projectUuid/chart-types/:dataAppVizUuid"
                    element={<ChartTypeBuilder />}
                />
                <Route
                    path="/projects/:projectUuid/chart-types"
                    element={<div>gallery</div>}
                />
                <Route
                    path="/projects/:projectUuid/home"
                    element={<div>home</div>}
                />
                <Route
                    path="/projects/:projectUuid/apps/:appUuid"
                    element={<div>app-builder</div>}
                />
                <Route
                    path="/projects/:projectUuid/tables"
                    element={<div>table-picker</div>}
                />
                <Route
                    path="/projects/:projectUuid/tables/:tableId"
                    element={<div>explorer</div>}
                />
            </Routes>
        </ChartColorMappingContext.Provider>
    </MemoryRouter>
);

const renderBuilder = (path: string) => {
    window.history.replaceState({}, '', path);
    return renderWithProviders(builderRoutes(path));
};

const mockedClarificationRound = vi.mocked(
    useClarificationRound<VizBuildRequest>,
);

const underlyingDataFeature: SdkFeature = {
    key: 'viz-underlying-data',
    label: 'View underlying data',
    description: 'Open the raw result rows behind a clicked data point.',
    appliesTo: ['chart_type'],
    wiring: 'Show the action menu when underlyingData.enabled.',
};

const staleUpgradeOffer: SdkUpgradeOffer = {
    status: 'stale',
    newFeatures: [underlyingDataFeature],
    newFixes: [],
    candidateFeatures: [underlyingDataFeature],
    reportedSdkVersion: '1.68.0',
    reportedFeatures: ['viz-context'],
};

describe('ChartTypeBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(useAmbientAiEnabled).mockReturnValue(false);
        vi.mocked(useAttachedExplore).mockReturnValue({
            explore: null,
            error: null,
            retry: vi.fn(),
        });
        vi.mocked(useExplorePreviewData).mockReturnValue({
            run: { status: 'idle' },
            isRunning: false,
            retry: vi.fn(),
        });
        vi.mocked(useExplores).mockReturnValue({
            data: [{ name: 'orders', label: 'Orders' }],
            isInitialLoading: false,
        } as unknown as ReturnType<typeof useExplores>);
        setFlag(true);
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useDataAppVizBuild).mockReturnValue(buildStub());
        mockedClarificationRound.mockReturnValue(clarificationStub());
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useDataAppVisualization>);
        vi.mocked(useSavedChartPreviewData).mockReturnValue({
            data: { status: 'notRun' },
            retry: vi.fn(),
        });
        setApp(null);
        vi.mocked(useAppVersionHistory).mockReturnValue(historyStub([], null));
        vi.mocked(useSdkUpgradeStatus).mockReturnValue({
            offer: staleUpgradeOffer,
            renderedManifest: null,
            onSdkManifest: vi.fn(),
        });
        vi.mocked(useUpgradeApp).mockReturnValue({
            mutate: vi.fn(),
            isLoading: false,
        } as unknown as ReturnType<typeof useUpgradeApp>);
    });

    it('redirects home when data apps are disabled', () => {
        setFlag(false);
        renderBuilder('/projects/p1/chart-types/new');

        expect(screen.getByText('home')).toBeInTheDocument();
    });

    it.each([
        {
            name: 'the data apps feature is disabled',
            path: '/projects/p1/chart-types/new',
            prepare: () => setFlag(false),
        },
        {
            name: 'the data apps feature flag is loading',
            path: '/projects/p1/chart-types/new',
            prepare: () =>
                vi.mocked(useServerFeatureFlag).mockReturnValue({
                    data: undefined,
                    isLoading: true,
                } as ReturnType<typeof useServerFeatureFlag>),
        },
        {
            name: 'the author cannot create chart types',
            path: '/projects/p1/chart-types/new',
            prepare: () =>
                vi.mocked(useCanCreateDataApp).mockReturnValue(false),
        },
        {
            name: 'the author cannot edit the chart type',
            path: '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
            prepare: () => {
                setApp(appMeta());
                vi.mocked(useCanEditDataApp).mockReturnValue(false);
            },
        },
        {
            name: 'the edit chart metadata is still loading',
            path: '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
            prepare: () => undefined,
        },
        {
            name: 'the app is not a chart type',
            path: '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
            prepare: () =>
                setApp(
                    appMeta({ template: 'dashboard' as AppMeta['template'] }),
                ),
        },
        {
            name: 'the chart type is registry installed',
            path: '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
            prepare: () => setApp(appMeta({ registrySlug: 'radial-gauge' })),
        },
    ])('does not run a saved chart query while $name', ({ path, prepare }) => {
        const savedChartUuid = '1e9a3b2c-0000-4000-8000-000000000010';
        prepare();

        renderBuilder(`${path}?savedChartUuid=${savedChartUuid}`);

        expect(useSavedChartPreviewData).toHaveBeenCalledWith({
            projectUuid: 'p1',
            savedChartUuid,
            enabled: false,
        });
    });

    it('sends users who cannot create back to the gallery', () => {
        vi.mocked(useCanCreateDataApp).mockReturnValue(false);
        renderBuilder('/projects/p1/chart-types/new');

        expect(screen.getByText('gallery')).toBeInTheDocument();
    });

    it('reports a chart type that does not exist', () => {
        setApp(null, { error: { statusCode: 404 } });
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByText('Chart type not found')).toBeInTheDocument();
    });

    it('resolves an edit route by slug', () => {
        setApp(appMeta());

        renderBuilder('/projects/p1/chart-types/stream-graph');

        expect(useGetApp).toHaveBeenCalledWith('p1', 'stream-graph');
        expect(screen.getByText('Stream graph')).toBeInTheDocument();
        expect(
            screen.getByText('Chart Studio', { exact: true }),
        ).toBeInTheDocument();
    });

    it.each(['', '   '])(
        'omits an unnamed chart type from the header (%j)',
        (name) => {
            setApp(appMeta({ name }));
            renderBuilder('/projects/p1/chart-types/stream-graph');

            expect(screen.queryByText(/Untitled/)).not.toBeInTheDocument();
            expect(
                screen.queryByRole('heading', { level: 6 }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Edit chart type details' }),
            ).toBeInTheDocument();
        },
    );

    it('hands non-viz apps to the app builder', () => {
        setApp(appMeta({ template: 'dashboard' as AppMeta['template'] }));
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByText('app-builder')).toBeInTheDocument();
    });

    it('sends non-editors back to the gallery', () => {
        setApp(appMeta());
        vi.mocked(useCanEditDataApp).mockReturnValue(false);
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByText('gallery')).toBeInTheDocument();
    });

    it('sends an official (registry-installed) chart type back to the gallery', () => {
        setApp(appMeta({ registrySlug: 'radial-gauge' }));
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByText('gallery')).toBeInTheDocument();
    });

    it('starts the create flow with a prompt and nothing else', () => {
        renderBuilder('/projects/p1/chart-types/new');

        expect(
            screen.queryByText('Chart Studio', { exact: true }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByText(
                'Describe the chart you’ve always wanted, or start from an example.',
            ),
        ).toBeInTheDocument();

        expect(
            screen.queryByText('Untitled chart type'),
        ).not.toBeInTheDocument();

        expect(
            screen.getByRole('heading', {
                name: 'Create with Chart Studio',
                level: 1,
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByText('Start with a prompt'),
        ).not.toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Describe a new chart type…'),
        ).toBeInTheDocument();
        // Starter prompts sit under the copy so the page is never a blank ask.
        expect(
            screen.getByText('A funnel of signup steps'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Preview in explorer')).toBeNull();
        // Nothing to configure before a schema exists.
        expect(screen.queryByText('Generated options')).toBeNull();
    });

    it('shows the configure panel as soon as a version declares a schema', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: {
                schema: { fields: [], configOptions: [], colorPalette: null },
            },
        } as unknown as ReturnType<typeof useDataAppVisualization>);
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        // No toggle to find: the panel sits beside the preview from the start.
        expect(screen.getByText('Generated options')).toBeInTheDocument();
        expect(
            screen.getByText('This chart type declares no display options.'),
        ).toBeInTheDocument();
    });

    it('keeps the configure panel beside the chart while it rebuilds', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: {
                schema: {
                    fields: [],
                    configOptions: [
                        {
                            name: 'grid',
                            label: 'Show grid',
                            type: 'boolean',
                            default: true,
                        },
                    ],
                    colorPalette: null,
                },
            },
        } as unknown as ReturnType<typeof useDataAppVisualization>);
        const route =
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001';
        const view = renderBuilder(route);
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));

        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000001',
                claimedVersion: 2,
                pendingPrompt: 'add markers',
            }),
        );
        view.rerender(builderRoutes(route));

        // Chart and options are one version: both stay legible under the
        // building pill, and both go out of play until the next one lands.
        expect(screen.getByLabelText('Show grid')).toBeInTheDocument();
        const card = screen.getByText('Generated options').closest('[inert]');
        expect(card).toHaveAttribute('data-dimmed', 'true');
        expect(screen.getByText(/Building…/)).toBeInTheDocument();
    });

    it('adopts the claimed app into the URL once a build is accepted', () => {
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000009',
                claimedVersion: 1,
                pendingPrompt: 'a stream graph of category share',
            }),
        );
        renderBuilder('/projects/p1/chart-types/new');

        // The edit route re-renders with the uuid param; its useGetApp stub
        // has no data, so the header stays bare.
        expect(
            screen.getByPlaceholderText('Ask for another change…'),
        ).toBeInTheDocument();
        // First build: the skeleton state echoes what was asked for.
        expect(
            screen.getByText('Building your chart type…'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('“a stream graph of category share”'),
        ).toBeInTheDocument();
    });

    it('preserves Explorer search when the create route adopts the app', () => {
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000009',
                claimedVersion: 1,
                pendingPrompt: 'a stream graph of category share',
            }),
        );
        const search = explorerSearch();

        renderBuilder(`/projects/p1/chart-types/new${search}`);

        expect(screen.getByTestId('location')).toHaveTextContent(
            `/projects/jaffle-shop/chart-types/1e9a3b2c-0000-4000-8000-000000000009${search}`,
        );
    });

    it('preserves the saved chart source when the create route adopts the app', () => {
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000009',
                claimedVersion: 1,
                pendingPrompt: 'a stream graph of category share',
            }),
        );
        const savedChartUuid = '1e9a3b2c-0000-4000-8000-000000000010';

        renderBuilder(
            `/projects/p1/chart-types/new?savedChartUuid=${savedChartUuid}`,
        );

        expect(screen.getByTestId('location')).toHaveTextContent(
            `/projects/jaffle-shop/chart-types/1e9a3b2c-0000-4000-8000-000000000009?savedChartUuid=${savedChartUuid}`,
        );
    });

    it('pauses and resumes the saved chart query while create adopts its uuid', () => {
        const savedChartUuid = '1e9a3b2c-0000-4000-8000-000000000010';
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000009';
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: dataAppVizUuid,
                claimedVersion: 1,
                pendingPrompt: 'a stream graph of category share',
            }),
        );

        const view = renderBuilder(
            `/projects/p1/chart-types/new?savedChartUuid=${savedChartUuid}`,
        );

        expect(useSavedChartPreviewData).toHaveBeenCalledWith({
            projectUuid: 'p1',
            savedChartUuid,
            enabled: true,
        });
        expect(useSavedChartPreviewData).toHaveBeenLastCalledWith({
            projectUuid: 'p1',
            savedChartUuid,
            enabled: false,
        });

        setApp(appMeta({ appUuid: dataAppVizUuid }));
        view.rerender(
            builderRoutes(
                `/projects/jaffle-shop/chart-types/${dataAppVizUuid}?savedChartUuid=${savedChartUuid}`,
            ),
        );

        expect(useSavedChartPreviewData).toHaveBeenLastCalledWith({
            projectUuid: 'p1',
            savedChartUuid,
            enabled: true,
        });
        expect(screen.getByTestId('location')).toHaveTextContent(
            `?savedChartUuid=${savedChartUuid}`,
        );
    });

    it.each(['chart', 'explore', 'merge'] as const)(
        'pivots %s preview rows for the bound series',
        async (source) => {
            const dimension = (name: string, type = DimensionType.STRING) => ({
                fieldType: FieldType.DIMENSION as const,
                type,
                name,
                label: name,
                table: 'orders',
                tableLabel: 'Orders',
                sql: name,
                hidden: false,
            });
            const itemsMap = {
                orders_date: dimension('date', DimensionType.DATE),
                orders_status: dimension('status'),
                orders_count: {
                    ...dimension('count'),
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                },
            } satisfies ItemsMap;
            const cell = (raw: string | number) => ({
                value: { raw, formatted: String(raw) },
            });
            const rows = [
                {
                    orders_date: cell('2026-01-01'),
                    count_placed: cell(10),
                    count_shipped: cell(11),
                },
            ];
            const pivotDetails: ReadyQueryResultsPage['pivotDetails'] = {
                indexColumn: [
                    { reference: 'orders_date', type: VizIndexType.TIME },
                ],
                groupByColumns: [{ reference: 'orders_status' }],
                valuesColumns: ['placed', 'shipped'].map((status, i) => ({
                    referenceField: 'orders_count',
                    pivotColumnName: `count_${status}`,
                    aggregation: VizAggregationOptions.ANY,
                    columnIndex: i + 1,
                    pivotValues: [
                        {
                            referenceField: 'orders_status',
                            value: status,
                            formatted: status,
                        },
                    ],
                })),
                totalColumnCount: 2,
                originalColumns: {},
                sortBy: undefined,
            };
            const run = {
                status: 'ready' as const,
                rows,
                itemsMap,
                columns: Object.values(itemsMap),
                pivotDetails,
                rowCount: 1,
                ranAt: new Date(),
            };
            setApp(appMeta());
            vi.mocked(useAppVersionHistory).mockReturnValue(
                historyStub([appVersion({ version: 1 })], 1),
            );
            vi.mocked(useDataAppVisualization).mockReturnValue({
                data: {
                    schema: {
                        fields: [
                            {
                                name: 'date',
                                label: 'Date',
                                type: 'dimension',
                                required: true,
                            },
                            {
                                name: 'status',
                                label: 'Status',
                                type: 'series',
                                required: true,
                            },
                            {
                                name: 'count',
                                label: 'Count',
                                type: 'metric',
                                required: true,
                            },
                        ],
                        configOptions: [],
                        colorPalette: null,
                    },
                },
            } as unknown as ReturnType<typeof useDataAppVisualization>);
            if (source !== 'explore') {
                vi.mocked(useSavedChartPreviewData).mockReturnValue({
                    data: {
                        ...run,
                        chartName: 'Orders',
                        spaceName: null,
                        itemsMap: {
                            orders_status: itemsMap.orders_status,
                            orders_date: itemsMap.orders_date,
                            orders_count: itemsMap.orders_count,
                        },
                        sourceChart: {
                            originalMetricQuery: {
                                ...explorerChart.metricQuery,
                                dimensions:
                                    source === 'merge'
                                        ? ['orders_date']
                                        : ['orders_status', 'orders_date'],
                                metrics: ['orders_count'],
                            },
                            parameters: { region: 'west' },
                            merge:
                                source === 'merge'
                                    ? {
                                          queries: {
                                              payments: {
                                                  explore: 'payments',
                                                  dimensions: ['payments_date'],
                                                  metrics: ['payments_total'],
                                              },
                                          },
                                          keys: {
                                              orders_date: [
                                                  'payments.payments_date',
                                              ],
                                          },
                                          join: MergeJoinType.LEFT,
                                          limit: 100,
                                      }
                                    : null,
                            metricQuery: {
                                ...explorerChart.metricQuery,
                                dimensions: ['orders_status', 'orders_date'],
                                metrics: ['orders_count'],
                            },
                            chartConfig: {
                                type: ChartType.CARTESIAN,
                                config: {
                                    layout: {
                                        xField: 'orders_date',
                                        yField: ['orders_count'],
                                    },
                                    eChartsConfig: {},
                                },
                            },
                            pivotConfig: { columns: ['orders_status'] },
                        },
                    },
                    retry: vi.fn(),
                });
            } else {
                vi.mocked(useAttachedExplore).mockReturnValue({
                    explore: {
                        name: 'orders',
                        label: 'Orders',
                        joinedTableLabels: [],
                        fields: Object.entries(itemsMap).map(([id, item]) => ({
                            id,
                            item,
                            label: item.label,
                        })),
                        itemsMap,
                    },
                    error: null,
                    retry: vi.fn(),
                });
                vi.mocked(useExplorePreviewData).mockReturnValue({
                    run,
                    isRunning: false,
                    retry: vi.fn(),
                });
            }
            renderBuilder(
                `/projects/p1/chart-types/viz-1?${source !== 'explore' ? 'savedChartUuid=chart-1' : 'exploreName=orders'}`,
            );
            const destination = new URL(
                screen
                    .getByRole('link', { name: 'Preview in explorer' })
                    .getAttribute('href')!,
                'http://lightdash.local',
            );
            const handoff = JSON.parse(
                destination.searchParams.get('create_saved_chart_version')!,
            );
            expect(destination.pathname).toBe('/projects/p1/tables/orders');
            expect(handoff.metricQuery).toMatchObject({
                dimensions:
                    source === 'merge'
                        ? ['orders_date']
                        : source === 'chart'
                          ? ['orders_status', 'orders_date']
                          : ['orders_date', 'orders_status'],
                metrics: ['orders_count'],
            });
            if (source !== 'explore')
                expect(handoff.parameters).toEqual({ region: 'west' });
            if (source === 'merge')
                expect(destination.searchParams.get('merge')).toContain(
                    'payments',
                );
            expect(handoff.pivotConfig).toEqual({ columns: ['orders_status'] });
            expect(handoff.chartConfig).toEqual({
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid: 'viz-1',
                    dataAppVizVersion: 1,
                    fieldMapping: {
                        date: 'orders_date',
                        status: 'orders_status',
                        count: 'orders_count',
                    },
                    optionValues: {},
                },
            });
            const context: DataAppVizContext = JSON.parse(
                screen.getByTestId('viz-context').textContent!,
            );
            expect(context.rows).toHaveLength(1);
            expect(context.pivotDetails?.groupByColumns).toEqual([
                { reference: 'orders_status' },
            ]);
            expect(context.pivotDetails?.valuesColumns).toHaveLength(2);
            for (const column of context.pivotDetails!.valuesColumns) {
                expect(context.rows[0][column.pivotColumnName].value.raw).toBe(
                    column.pivotValues[0].value === 'placed' ? 10 : 11,
                );
                expect(
                    context.seriesColors[column.pivotColumnName],
                ).toBeDefined();
            }
            fireEvent.click(screen.getByRole('button', { name: 'View all' }));
            const dialog = await screen.findByRole('dialog', {
                name: 'Query results',
            });
            expect(
                within(dialog).getByRole('columnheader', {
                    name: 'count · placed',
                }),
            ).toBeVisible();
            expect(
                within(dialog).getByRole('columnheader', {
                    name: 'count · shipped',
                }),
            ).toBeVisible();
            expect(
                within(dialog).getByRole('cell', { name: '10' }),
            ).toBeVisible();
            expect(
                within(dialog).getByRole('cell', { name: '11' }),
            ).toBeVisible();
            if (source !== 'explore') {
                fireEvent.click(
                    within(dialog).getByRole('button', { name: 'Close' }),
                );
                fireEvent.click(
                    screen.getByRole('combobox', { name: 'Status' }),
                );
                fireEvent.click(screen.getByRole('option', { name: /^date$/ }));
                const rebound: DataAppVizContext = JSON.parse(
                    screen.getByTestId('viz-context').textContent!,
                );
                expect(rebound.fieldMapping.status).toBe('orders_date');
                const reboundDestination = new URL(
                    screen
                        .getByRole('link', { name: 'Preview in explorer' })
                        .getAttribute('href')!,
                    'http://lightdash.local',
                );
                expect(
                    JSON.parse(
                        reboundDestination.searchParams.get(
                            'create_saved_chart_version',
                        )!,
                    ).pivotConfig,
                ).toEqual({ columns: ['orders_date'] });
                expect(useSavedChartBindingPreview).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        fieldMapping: expect.objectContaining({
                            status: 'orders_date',
                        }),
                    }),
                );
            }
        },
    );

    it('uses a saved chart without sending its rows by default', () => {
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000001';
        const savedChartUuid = '1e9a3b2c-0000-4000-8000-000000000010';
        setApp(appMeta({ appUuid: dataAppVizUuid }));
        vi.mocked(useSavedChartPreviewData).mockReturnValue({
            data: {
                status: 'ready',
                sourceChart: null,
                chartName: 'Orders by status',
                spaceName: 'Sales',
                rows: [],
                itemsMap: {},
                columns: [],
                pivotDetails: null,
                rowCount: 0,
                ranAt: new Date('2026-09-22T00:00:00.000Z'),
            },
            retry: vi.fn(),
        });

        renderBuilder(
            `/projects/p1/chart-types/${dataAppVizUuid}?savedChartUuid=${savedChartUuid}`,
        );

        expect(useDataAppVizBuild).toHaveBeenCalledWith(
            expect.objectContaining({
                chartReference: {
                    uuid: savedChartUuid,
                    includeSampleData: false,
                },
            }),
        );
    });

    it('clears sample row consent when the saved chart is detached', () => {
        const savedChartUuid = '1e9a3b2c-0000-4000-8000-000000000010';
        vi.mocked(useSavedChartPreviewData).mockReturnValue({
            data: {
                status: 'ready',
                sourceChart: null,
                chartName: 'Orders by status',
                spaceName: 'Sales',
                rows: [],
                itemsMap: {},
                columns: [],
                pivotDetails: null,
                rowCount: 0,
                ranAt: new Date('2026-09-22T00:00:00.000Z'),
            },
            retry: vi.fn(),
        });
        renderBuilder(
            `/projects/p1/chart-types/new?savedChartUuid=${savedChartUuid}`,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Include rows' }));
        expect(screen.getByText(/Rows included/)).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: 'Use sample data instead' }),
        );

        expect(screen.getByTestId('location')).not.toHaveTextContent(
            'savedChartUuid',
        );
        expect(screen.queryByText(/Rows included/)).not.toBeInTheDocument();
        expect(screen.getByText('Use a saved chart')).toBeInTheDocument();
    });

    it('returns to the Explorer query with the freshly built chart type', () => {
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000001';
        setApp(appMeta({ appUuid: dataAppVizUuid }));
        const search = explorerSearch();

        renderBuilder(`/projects/p1/chart-types/${dataAppVizUuid}${search}`);

        const backLink = screen.getByRole('link', { name: 'Explorer' });
        const destination = new URL(
            backLink.getAttribute('href') ?? '',
            'http://lightdash.local',
        );
        expect(destination.pathname).toBe('/projects/p1/tables/orders');
        expect(destination.searchParams.get('fromSpace')).toBe('space-1');
        expect(
            JSON.parse(
                destination.searchParams.get('create_saved_chart_version') ??
                    '',
            ),
        ).toEqual({
            ...explorerChart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid,
                    fieldMapping: {},
                    optionValues: {},
                },
            },
        });
    });

    it('previews the ready chart type with the existing Explorer query', () => {
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000001';
        setApp(appMeta({ appUuid: dataAppVizUuid }));
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        renderBuilder(
            `/projects/p1/chart-types/${dataAppVizUuid}${explorerSearch()}`,
        );

        const previewLink = screen.getByRole('link', {
            name: 'Preview in explorer',
        });
        expect(previewLink).toHaveAttribute(
            'href',
            expect.stringContaining('/projects/p1/tables/orders?'),
        );

        fireEvent.click(previewLink);

        const destination = new URL(
            screen.getByTestId('location').textContent ?? '',
            'http://lightdash.local',
        );
        expect(destination.pathname).toBe('/projects/p1/tables/orders');
        expect(destination.searchParams.get('fromSpace')).toBe('space-1');
        const previewChart = JSON.parse(
            destination.searchParams.get('create_saved_chart_version') ?? '',
        );
        expect(previewChart).toEqual({
            ...explorerChart,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: {
                    dataAppVizUuid,
                    dataAppVizVersion: 1,
                    fieldMapping: {},
                    optionValues: {},
                },
            },
        });
    });

    it('waits for an attached saved chart instead of offering an unrelated table', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        vi.mocked(useSavedChartPreviewData).mockReturnValue({
            data: { status: 'running', chartName: 'Orders', spaceName: null },
            retry: vi.fn(),
        });
        renderBuilder('/projects/p1/chart-types/viz-1?savedChartUuid=chart-1');
        expect(
            screen.getByRole('button', { name: 'Preview in explorer' }),
        ).toBeDisabled();
    });

    it('previews a standalone chart type through the table picker', () => {
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000001';
        setApp(appMeta({ appUuid: dataAppVizUuid }));
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: {
                schema: {
                    fields: [],
                    configOptions: [
                        {
                            name: 'grid',
                            label: 'Show grid',
                            type: 'boolean',
                            default: true,
                        },
                    ],
                    colorPalette: null,
                },
            },
        } as unknown as ReturnType<typeof useDataAppVisualization>);
        renderBuilder(`/projects/p1/chart-types/${dataAppVizUuid}`);
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));
        fireEvent.click(screen.getByLabelText('Show grid'));

        expect(
            screen.getByRole('link', { name: 'Chart types' }),
        ).toHaveAttribute('href', '/projects/jaffle-shop/chart-types');
        fireEvent.click(
            screen.getByRole('button', { name: 'Preview in explorer' }),
        );
        expect(
            screen.getByRole('dialog', { name: 'Preview in explorer' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('location')).toHaveTextContent(
            `/projects/p1/chart-types/${dataAppVizUuid}`,
        );
        expect(
            screen.getByRole('button', { name: 'Open in explorer' }),
        ).toBeDisabled();
        fireEvent.click(screen.getByPlaceholderText('Select a table'));
        fireEvent.click(screen.getByText('Orders'));
        fireEvent.click(
            screen.getByRole('button', { name: 'Open in explorer' }),
        );
        const destination = new URL(
            screen.getByTestId('location').textContent!,
            'http://lightdash.local',
        );
        expect(destination.pathname).toBe('/projects/p1/tables/orders');
        expect(destination.searchParams.get('chartSidebar')).toBe('configure');
        expect(
            JSON.parse(
                destination.searchParams.get('create_saved_chart_version')!,
            ).chartConfig.config,
        ).toEqual({
            dataAppVizUuid,
            dataAppVizVersion: 1,
            fieldMapping: {},
            optionValues: { grid: false },
        });
    });

    it('treats malformed Explorer state as a standalone builder session', () => {
        setApp(appMeta());

        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001?create_saved_chart_version=not-json',
        );

        expect(
            screen.getByRole('link', { name: 'Chart types' }),
        ).toHaveAttribute('href', '/projects/jaffle-shop/chart-types');
    });

    it('keeps a drafted follow-up when the create route adopts the app', () => {
        let currentBuild = buildStub({
            isBuilding: true,
            pendingPrompt: 'a stream graph of category share',
        });
        vi.mocked(useDataAppVizBuild).mockImplementation(() => currentBuild);
        const view = renderBuilder('/projects/p1/chart-types/new');
        const composer = screen.getByPlaceholderText('Ask for another change…');
        fireEvent.change(composer, {
            target: { value: 'make the target markers red' },
        });

        currentBuild = buildStub({
            draftAppUuid: 'draft-app-2',
            isBuilding: true,
            appUuid: '1e9a3b2c-0000-4000-8000-000000000009',
            claimedVersion: 1,
            pendingPrompt: 'a stream graph of category share',
        });
        view.rerender(builderRoutes('/projects/p1/chart-types/new'));

        expect(
            screen.getByPlaceholderText('Ask for another change…'),
        ).toHaveValue('make the target markers red');
    });

    it('keeps the previous version dimmed under the pill while rebuilding', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000001',
                claimedVersion: 2,
                pendingPrompt: 'make the bars teal',
            }),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByTestId('app-preview')).toHaveTextContent(
            'preview-v1',
        );
        expect(screen.getByText(/Building…/)).toBeInTheDocument();
        expect(screen.queryByText('Building your chart type…')).toBeNull();
        // A rebuild echoes its prompt too, not just the first build.
        expect(screen.getByText('“make the bars teal”')).toBeInTheDocument();
    });

    it('keeps the composer editable while the first version builds', () => {
        // The in-progress v1 is already in history; "has versions" is not the signal.
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1, status: 'building' })], null),
        );
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000001',
                claimedVersion: 1,
                pendingPrompt: 'give me a chart type',
                startedAt: new Date('2026-05-15T10:00:00Z'),
            }),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(
            screen.getByPlaceholderText('Ask for another change…'),
        ).toBeEnabled();
    });

    it('shows the polled trace when reopening an in-progress build', () => {
        setApp(appMeta({ latestReadyVersion: 1 }));
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [
                    appVersion({
                        version: 2,
                        status: 'generating',
                        statusHistory: [
                            {
                                kind: 'thinking',
                                message: 'Choosing a horizontal layout',
                                timestamp: '2026-05-15T10:00:10Z',
                            },
                            {
                                kind: 'tool',
                                message: 'Updating Chart.tsx',
                                timestamp: '2026-05-15T10:00:20Z',
                            },
                        ],
                    }),
                    appVersion({ version: 1 }),
                ],
                1,
            ),
        );

        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByText('Reasoning')).toBeInTheDocument();
        expect(
            screen.getAllByText('Choosing a horizontal layout').length,
        ).toBeGreaterThan(0);
        expect(screen.getByText('Activity')).toBeInTheDocument();
        expect(
            screen.getAllByText('Updating Chart.tsx').length,
        ).toBeGreaterThan(0);
    });

    it('renders the current version and lists its history on demand', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByTestId('app-preview')).toHaveTextContent(
            'preview-v2',
        );
        expect(screen.getByText('Preview in explorer')).toBeInTheDocument();
        expect(
            screen.getByPlaceholderText('Ask for a change…'),
        ).toBeInTheDocument();
        // The timeline lives behind the header toggle, not above the chart.
        expect(screen.queryByLabelText('Version history')).toBeNull();

        fireEvent.click(screen.getByText('History'));
        expect(screen.getByLabelText('Version history')).toBeInTheDocument();
        expect(
            screen.getByRole('separator', {
                name: 'Resize version history',
            }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Preview' }),
        ).toBeInTheDocument();
    });

    it('offers the preview SDK upgrade and opens history after starting it', () => {
        const onSdkManifest = vi.fn();
        const mutate = vi.fn((_params, options) =>
            options?.onSuccess?.({ appUuid: 'viz-1', version: 3 }),
        );
        vi.mocked(useSdkUpgradeStatus).mockReturnValue({
            offer: staleUpgradeOffer,
            renderedManifest: null,
            onSdkManifest,
        });
        vi.mocked(useUpgradeApp).mockReturnValue({
            mutate,
            isLoading: false,
        } as unknown as ReturnType<typeof useUpgradeApp>);
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 2 })], 2),
        );

        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        fireEvent.click(screen.getByText('Report SDK manifest'));
        expect(onSdkManifest).toHaveBeenCalledWith({
            sdkVersion: '1.68.0',
            features: ['query'],
            fixes: [],
        });

        fireEvent.click(
            screen.getByRole('button', { name: /upgrade available/i }),
        );
        expect(screen.getByText('Upgrade chart type')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Start upgrade' }));

        expect(mutate).toHaveBeenCalled();
        expect(screen.getByLabelText('Version history')).toBeInTheDocument();
    });

    it('keys the upgrade offer to the latest ready version, not the viewed one', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );

        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        const keyedToLatestReady = () =>
            vi.mocked(useSdkUpgradeStatus).mock.lastCall?.[0];

        expect(keyedToLatestReady()).toEqual({
            target: 'chart_type',
            bundleKey: 'viz-1:2',
            renderedKey: 'viz-1:2',
            isRendering: true,
        });

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        // An upgrade always rebuilds from v2, so the offer keeps describing
        // it; the v1 bundle on screen must not be classified in its place.
        expect(keyedToLatestReady()).toEqual({
            target: 'chart_type',
            bundleKey: 'viz-1:2',
            renderedKey: 'viz-1:1',
            isRendering: false,
        });
        expect(screen.getByText('preview-v1')).toBeInTheDocument();
    });

    it('disables SDK upgrades while another version is building', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [
                    appVersion({ version: 3, status: 'generating' }),
                    appVersion({ version: 2 }),
                ],
                2,
            ),
        );

        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(
            screen.getByRole('button', { name: /upgrade available/i }),
        ).toBeDisabled();
    });

    it('previews a version picked from history and follows the current one again when the panel closes', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        expect(screen.getByTestId('app-preview')).toHaveTextContent(
            'preview-v1',
        );

        fireEvent.click(screen.getByLabelText('Collapse version history'));
        expect(screen.queryByLabelText('Version history')).toBeNull();
        expect(screen.getByTestId('app-preview')).toHaveTextContent(
            'preview-v2',
        );
    });

    // The schema belongs to the version that generated it, so a v1 preview must
    // not be configured with v2's options.
    const setSchemaPerVersion = () =>
        vi.mocked(useDataAppVisualization).mockImplementation(
            (_projectUuid, _dataAppVizUuid, version) =>
                ({
                    data: {
                        schema: {
                            fields: [],
                            configOptions: [
                                version === 1
                                    ? {
                                          name: 'grid',
                                          label: 'Show grid',
                                          type: 'boolean',
                                          default: true,
                                      }
                                    : {
                                          name: 'markers',
                                          label: 'Show markers',
                                          type: 'boolean',
                                          default: true,
                                      },
                            ],
                            colorPalette: null,
                        },
                    },
                }) as unknown as ReturnType<typeof useDataAppVisualization>,
        );

    it('configures the version being previewed, not the current one', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );
        setSchemaPerVersion();
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));

        expect(screen.getByLabelText('Show markers')).toBeInTheDocument();

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));

        // The uuid comes from the loaded app row, the version from the pin.
        expect(vi.mocked(useDataAppVisualization)).toHaveBeenLastCalledWith(
            'p1',
            'viz-1',
            1,
        );
        expect(screen.getByLabelText('Show grid')).toBeInTheDocument();
        expect(screen.queryByLabelText('Show markers')).toBeNull();

        fireEvent.click(screen.getByLabelText('Collapse version history'));
        expect(screen.getByLabelText('Show markers')).toBeInTheDocument();
        expect(screen.queryByLabelText('Show grid')).toBeNull();
    });

    it('keeps a value set on the current version across a visit to an older one', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [appVersion({ version: 2 }), appVersion({ version: 1 })],
                2,
            ),
        );
        setSchemaPerVersion();
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );
        fireEvent.click(screen.getByRole('tab', { name: 'Display' }));

        fireEvent.click(screen.getByLabelText('Show markers'));
        expect(screen.getByLabelText('Show markers')).not.toBeChecked();

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
        fireEvent.click(screen.getByLabelText('Collapse version history'));

        expect(screen.getByLabelText('Show markers')).not.toBeChecked();
    });

    it('shows the name and description read-only, and edits them in a modal', () => {
        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        // The title is text, not a field you can type over by accident.
        expect(screen.queryByLabelText('Chart type name')).toBeNull();
        expect(screen.getByText('Stream graph')).toBeInTheDocument();
        expect(
            screen.getByLabelText('Chart type description'),
        ).toBeInTheDocument();

        fireEvent.click(screen.getByLabelText('Edit chart type details'));
        expect(screen.getByText('Update Chart Type')).toBeInTheDocument();
        expect(screen.getByLabelText(/Name/)).toHaveValue('Stream graph');
        expect(screen.getByLabelText(/Description/)).toHaveValue(
            'Layered flows',
        );
    });

    it('offers no history toggle before the first version exists', () => {
        renderBuilder('/projects/p1/chart-types/new');

        expect(screen.queryByText('History')).toBeNull();
    });

    it('explains a failed first build and keeps the prompt open', () => {
        setApp(appMeta({ latestReadyVersion: null }));
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub(
                [
                    appVersion({
                        version: 1,
                        status: 'error',
                        statusMessage: 'Sandbox crashed',
                    }),
                ],
                null,
            ),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

        expect(screen.getByText('The build failed')).toBeInTheDocument();
        expect(screen.getByText('Sandbox crashed')).toBeInTheDocument();
        // Nothing is running any more, so the retry has to be typeable.
        expect(screen.getByPlaceholderText('Ask for a change…')).toBeEnabled();
    });

    it('clarifies a first prompt, but never a revision', () => {
        renderBuilder('/projects/p1/chart-types/new');
        expect(mockedClarificationRound.mock.lastCall?.[0]).toMatchObject({
            isFirstBuild: true,
        });

        setApp(appMeta());
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1, status: 'ready' })], 1),
        );
        renderBuilder('/projects/p1/chart-types/viz-1');
        expect(mockedClarificationRound.mock.lastCall?.[0]).toMatchObject({
            isFirstBuild: false,
        });
    });

    it('says when a build started without the clarifier', () => {
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({ isBuilding: true, pendingPrompt: 'show revenue' }),
        );
        mockedClarificationRound.mockReturnValue(
            clarificationStub({ fellThrough: true }),
        );
        renderBuilder('/projects/p1/chart-types/new');

        expect(
            screen.getByText(/Couldn’t reach the clarifier/),
        ).toBeInTheDocument();
    });

    describe('ambient AI field picks', () => {
        const dimension = (
            name: string,
            label: string,
            type = DimensionType.STRING,
        ) => ({
            fieldType: FieldType.DIMENSION as const,
            type,
            name,
            label,
            table: 'orders',
            tableLabel: 'Orders',
            sql: name,
            hidden: false,
        });
        const metric = (name: string, label: string) => ({
            ...dimension(name, label),
            fieldType: FieldType.METRIC as const,
            type: MetricType.SUM,
        });
        const itemsMap = {
            orders_status: dimension('status', 'Status'),
            orders_region: dimension('region', 'Region'),
            orders_shipped_date: dimension(
                'shipped_date',
                'Shipped date',
                DimensionType.DATE,
            ),
            orders_count: metric('count', 'Count'),
            orders_total: metric('total', 'Total'),
        } satisfies ItemsMap;
        const groupBy = {
            name: 'group',
            label: 'Group by',
            type: 'dimension' as const,
            required: true,
        };
        const value = {
            name: 'value',
            label: 'Value',
            type: 'metric' as const,
            required: true,
        };
        const suggestions = {
            suggestions: [
                {
                    fieldName: 'group',
                    fieldIds: ['orders_region'],
                    reason: 'Region is how the prompt splits revenue.',
                    alternatives: ['orders_shipped_date'],
                },
                {
                    fieldName: 'value',
                    fieldIds: ['orders_total'],
                    reason: 'Total is the revenue the prompt asks for.',
                    alternatives: [],
                },
            ],
        };
        const deferred = <T,>() => {
            let resolve: (value: T) => void = () => undefined;
            let reject: (error: unknown) => void = () => undefined;
            const promise = new Promise<T>((res, rej) => {
                resolve = res;
                reject = rej;
            });
            return { promise, resolve, reject };
        };
        const setSchema = (fields: DataAppVizField[]) =>
            vi.mocked(useDataAppVisualization).mockReturnValue({
                data: {
                    schema: { fields, configOptions: [], colorPalette: null },
                },
            } as unknown as ReturnType<typeof useDataAppVisualization>);
        const path = '/projects/p1/chart-types/viz-1?exploreName=orders';
        const lastPreviewCall = () =>
            vi.mocked(useExplorePreviewData).mock.lastCall![0];
        const marks = () =>
            screen.queryAllByRole('img', { name: /^Picked for your prompt/ });

        beforeEach(() => {
            vi.mocked(useAmbientAiEnabled).mockReturnValue(true);
            setApp(appMeta());
            vi.mocked(useAppVersionHistory).mockReturnValue(
                historyStub(
                    [
                        appVersion({
                            version: 1,
                            prompt: 'revenue by region',
                            resources: {
                                clarifications: [
                                    {
                                        question: 'Which measure?',
                                        answer: 'Total revenue',
                                    },
                                ],
                            } as unknown as ApiAppVersionSummary['resources'],
                        }),
                    ],
                    1,
                ),
            );
            setSchema([groupBy, value]);
            vi.mocked(useAttachedExplore).mockReturnValue({
                explore: {
                    name: 'orders',
                    label: 'Orders',
                    joinedTableLabels: [],
                    fields: Object.entries(itemsMap).map(([id, item]) => ({
                        id,
                        item,
                        label: item.label,
                    })),
                    itemsMap,
                },
                error: null,
                retry: vi.fn(),
            });
            vi.mocked(useExplorePreviewData).mockReturnValue({
                run: {
                    status: 'ready',
                    rows: [],
                    itemsMap,
                    columns: Object.values(itemsMap),
                    pivotDetails: null,
                    rowCount: 0,
                    ranAt: new Date(),
                },
                isRunning: false,
                retry: vi.fn(),
            });
        });

        it('holds the query for the suggestion, then runs it with the suggested fields', async () => {
            const pending = deferred<typeof suggestions>();
            vi.mocked(suggestChartTypeFields).mockReturnValue(pending.promise);
            renderBuilder(path);

            expect(suggestChartTypeFields).toHaveBeenCalledTimes(1);
            expect(vi.mocked(suggestChartTypeFields).mock.calls[0][1]).toEqual({
                prompt: 'revenue by region',
                clarifications: ['Total revenue'],
                exploreName: 'orders',
                fields: [groupBy, value],
            });
            expect(lastPreviewCall()).toMatchObject({
                isPickingFields: true,
                fieldMapping: {},
            });
            expect(
                screen.getByRole('button', {
                    name: 'Change preview data: Orders',
                }),
            ).toHaveTextContent('Table · picking fields');

            await act(async () => pending.resolve(suggestions));

            await waitFor(() =>
                expect(lastPreviewCall()).toMatchObject({
                    isPickingFields: false,
                    fieldMapping: {
                        group: 'orders_region',
                        value: 'orders_total',
                    },
                }),
            );
            expect(
                screen.getByText(
                    'Picked from Orders for your prompt. Changing one re-runs the query.',
                ),
            ).toBeInTheDocument();
            expect(marks()).toHaveLength(2);
        });

        it('falls back to the automap and today’s hint when the suggestion fails', async () => {
            vi.mocked(suggestChartTypeFields).mockRejectedValue(
                new DOMException('The operation was aborted.', 'AbortError'),
            );
            renderBuilder(path);

            await waitFor(() =>
                expect(lastPreviewCall()).toMatchObject({
                    isPickingFields: false,
                    fieldMapping: {
                        group: 'orders_status',
                        value: 'orders_count',
                    },
                }),
            );
            expect(
                screen.getByText(
                    'Fields from Orders. Changing one re-runs the query.',
                ),
            ).toBeInTheDocument();
            expect(marks()).toHaveLength(0);
        });

        it('does nothing new with ambient AI off', () => {
            vi.mocked(useAmbientAiEnabled).mockReturnValue(false);
            renderBuilder(path);

            expect(suggestChartTypeFields).not.toHaveBeenCalled();
            expect(lastPreviewCall()).toMatchObject({
                isPickingFields: false,
                fieldMapping: { group: 'orders_status', value: 'orders_count' },
            });
        });

        it('explains a pick on hover and lists the alternatives first in its select', async () => {
            vi.mocked(suggestChartTypeFields).mockResolvedValue(suggestions);
            renderBuilder(path);
            await waitFor(() => expect(marks()).toHaveLength(2));

            fireEvent.mouseEnter(marks()[0]);
            expect(
                await screen.findByText(
                    'Region is how the prompt splits revenue. Also fits: Shipped date.',
                ),
            ).toBeInTheDocument();

            fireEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
            const listbox = await screen.findByRole('listbox');
            const suggestedGroup = within(listbox).getByText('Suggested');
            const [first, second] = within(listbox).getAllByRole('option');
            expect(suggestedGroup).toBeInTheDocument();
            expect(first).toHaveTextContent('Region');
            expect(second).toHaveTextContent('Shipped date');
        });

        it('clears only the mark of the input the author changes', async () => {
            vi.mocked(suggestChartTypeFields).mockResolvedValue(suggestions);
            renderBuilder(path);
            await waitFor(() => expect(marks()).toHaveLength(2));

            fireEvent.click(screen.getByRole('combobox', { name: 'Value' }));
            fireEvent.click(
                await screen.findByRole('option', { name: 'Count' }),
            );

            expect(marks()).toHaveLength(1);
            expect(
                screen.getByText(
                    'Picked from Orders for your prompt. Changing one re-runs the query.',
                ),
            ).toBeInTheDocument();

            fireEvent.click(screen.getByRole('combobox', { name: 'Group by' }));
            fireEvent.click(
                await screen.findByRole('option', { name: 'Status' }),
            );

            expect(marks()).toHaveLength(0);
            expect(
                screen.getByText(
                    'Fields from Orders. Changing one re-runs the query.',
                ),
            ).toBeInTheDocument();
        });

        it('asks only about inputs a rebuild adds, keeping every binding', async () => {
            vi.mocked(suggestChartTypeFields).mockResolvedValueOnce(
                suggestions,
            );
            const { rerender } = renderBuilder(path);
            await waitFor(() => expect(marks()).toHaveLength(2));
            fireEvent.click(screen.getByRole('combobox', { name: 'Value' }));
            fireEvent.click(
                await screen.findByRole('option', { name: 'Count' }),
            );

            const colour = {
                name: 'colour',
                label: 'Colour',
                type: 'dimension' as const,
                required: false,
            };
            const pending = deferred<typeof suggestions>();
            vi.mocked(suggestChartTypeFields).mockReturnValueOnce(
                pending.promise,
            );
            setSchema([groupBy, value, colour]);
            rerender(builderRoutes(path));

            expect(suggestChartTypeFields).toHaveBeenCalledTimes(2);
            expect(
                vi.mocked(suggestChartTypeFields).mock.calls[1][1].fields,
            ).toEqual([colour]);
            expect(lastPreviewCall()).toMatchObject({ isPickingFields: true });

            await act(async () =>
                pending.resolve({
                    suggestions: [
                        {
                            fieldName: 'colour',
                            fieldIds: ['orders_status'],
                            reason: 'Status colours each bar.',
                            alternatives: [],
                        },
                    ],
                }),
            );

            expect(lastPreviewCall()).toMatchObject({
                isPickingFields: false,
                fieldMapping: {
                    group: 'orders_region',
                    value: 'orders_count',
                    colour: 'orders_status',
                },
            });
            expect(marks()).toHaveLength(2);
        });
    });
});
