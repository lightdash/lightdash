import {
    ChartType,
    FeatureFlags,
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useAppVersionHistory,
    type AppVersionHistory,
} from '../features/apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useClarificationRound } from '../features/apps/hooks/useClarificationRound';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { useSdkUpgradeStatus } from '../features/apps/hooks/useSdkUpgradeStatus';
import { useUpgradeApp } from '../features/apps/hooks/useUpgradeApp';
import { appVersion } from '../features/apps/testing/appVersionHistory';
import { useDataAppVisualization } from '../features/chartTypes/hooks/useDataAppVisualization';
import { useDataAppVizBuild } from '../features/chartTypes/hooks/useDataAppVizBuild';
import { type VizBuildRequest } from '../features/chartTypes/hooks/useDataAppVizBuild';
import { clarificationStub } from '../features/chartTypes/testing/clarificationRoundStub';
import { buildStub } from '../features/chartTypes/testing/dataAppVizBuildStub';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import { renderWithProviders } from '../testing/testUtils';
import ChartTypeBuilder from './ChartTypeBuilder';

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: vi.fn(),
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
    }: {
        version: number;
        onSdkManifest?: (manifest: {
            sdkVersion: string;
            features: string[];
        }) => void;
    }) => (
        <div data-testid="app-preview">
            {`preview-v${version}`}
            <button
                type="button"
                onClick={() =>
                    onSdkManifest?.({
                        sdkVersion: '1.68.0',
                        features: ['query'],
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
                path="/projects/:projectUuid/gallery"
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
    </MemoryRouter>
);

const renderBuilder = (path: string) => {
    window.history.replaceState({}, '', path);
    return renderWithProviders(builderRoutes(path));
};

const mockedClarificationRound = vi.mocked(
    useClarificationRound<VizBuildRequest>,
);

const staleUpgradeOffer = {
    status: 'stale' as const,
    newFeatures: [
        {
            key: 'metric-filters',
            label: 'Metric filters',
            description: 'Filter grouped results by metric values.',
            wiring: 'Pass metric filters to the query builder.',
        },
    ],
    candidateFeatures: [
        {
            key: 'metric-filters',
            label: 'Metric filters',
            description: 'Filter grouped results by metric values.',
            wiring: 'Pass metric filters to the query builder.',
        },
    ],
    reportedSdkVersion: '1.68.0',
    reportedFeatures: ['query'],
};

describe('ChartTypeBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setFlag(true);
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useDataAppVizBuild).mockReturnValue(buildStub());
        mockedClarificationRound.mockReturnValue(clarificationStub());
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useDataAppVisualization>);
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

    it('starts the create flow with a prompt and nothing else', () => {
        renderBuilder('/projects/p1/chart-types/new');

        expect(screen.getByText('Start with a prompt')).toBeInTheDocument();
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
        vi.mocked(useDataAppVizBuild).mockReturnValue(
            buildStub({
                isBuilding: true,
                appUuid: '1e9a3b2c-0000-4000-8000-000000000001',
                claimedVersion: 2,
                pendingPrompt: 'add markers',
            }),
        );
        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001',
        );

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
            `/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000009${search}`,
        );
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

        fireEvent.click(screen.getByText('Preview in explorer'));

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
                    fieldMapping: {},
                    optionValues: {},
                },
            },
        });
    });

    it('previews a standalone chart type through the table picker', () => {
        const dataAppVizUuid = '1e9a3b2c-0000-4000-8000-000000000001';
        setApp(appMeta({ appUuid: dataAppVizUuid }));
        vi.mocked(useAppVersionHistory).mockReturnValue(
            historyStub([appVersion({ version: 1 })], 1),
        );
        renderBuilder(`/projects/p1/chart-types/${dataAppVizUuid}`);

        expect(screen.getByRole('link', { name: 'Gallery' })).toHaveAttribute(
            'href',
            '/projects/p1/gallery',
        );
        fireEvent.click(screen.getByText('Preview in explorer'));

        expect(screen.getByTestId('location')).toHaveTextContent(
            `/projects/p1/tables?dataAppVizUuid=${dataAppVizUuid}`,
        );
        expect(screen.getByText('table-picker')).toBeInTheDocument();
    });

    it('treats malformed Explorer state as a standalone builder session', () => {
        setApp(appMeta());

        renderBuilder(
            '/projects/p1/chart-types/1e9a3b2c-0000-4000-8000-000000000001?create_saved_chart_version=not-json',
        );

        expect(screen.getByRole('link', { name: 'Gallery' })).toHaveAttribute(
            'href',
            '/projects/p1/gallery',
        );
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
        expect(screen.getByLabelText('View v1')).toBeInTheDocument();
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
            bundleKey: 'viz-1:2',
            renderedKey: 'viz-1:2',
            isRendering: true,
        });

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByLabelText('View v1'));

        // An upgrade always rebuilds from v2, so the offer keeps describing
        // it; the v1 bundle on screen must not be classified in its place.
        expect(keyedToLatestReady()).toEqual({
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
        fireEvent.click(screen.getByLabelText('View v1'));
        expect(screen.getByTestId('app-preview')).toHaveTextContent(
            'preview-v1',
        );

        fireEvent.click(screen.getByLabelText('Close history'));
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

        expect(screen.getByLabelText('Show markers')).toBeInTheDocument();

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByLabelText('View v1'));

        // The uuid comes from the loaded app row, the version from the pin.
        expect(vi.mocked(useDataAppVisualization)).toHaveBeenLastCalledWith(
            'p1',
            'viz-1',
            1,
        );
        expect(screen.getByLabelText('Show grid')).toBeInTheDocument();
        expect(screen.queryByLabelText('Show markers')).toBeNull();

        fireEvent.click(screen.getByLabelText('Close history'));
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

        fireEvent.click(screen.getByLabelText('Show markers'));
        expect(screen.getByLabelText('Show markers')).not.toBeChecked();

        fireEvent.click(screen.getByText('History'));
        fireEvent.click(screen.getByLabelText('View v1'));
        fireEvent.click(screen.getByLabelText('Close history'));

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
});
