import {
    FeatureFlags,
    type ApiAppVersionSummary,
    type ApiGetAppResponse,
} from '@lightdash/common';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useAppVersionHistory,
    type AppVersionHistory,
} from '../features/apps/hooks/useAppVersionHistory';
import { useCanCreateDataApp } from '../features/apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../features/apps/hooks/useCanEditDataApp';
import { useDataAppVisualization } from '../features/apps/hooks/useDataAppVisualization';
import { useDataAppVizBuild } from '../features/apps/hooks/useDataAppVizBuild';
import { useGetApp } from '../features/apps/hooks/useGetApp';
import { appVersion } from '../features/apps/testing/appVersionHistory';
import { buildStub } from '../features/apps/testing/dataAppVizBuildStub';
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
vi.mock('../features/apps/hooks/useAppVersionHistory', () => ({
    useAppVersionHistory: vi.fn(),
}));
vi.mock('../features/apps/hooks/useDataAppVizBuild', () => ({
    useDataAppVizBuild: vi.fn(),
}));
vi.mock('../features/apps/hooks/useDataAppVisualization', () => ({
    useDataAppVisualization: vi.fn(),
}));
vi.mock('../features/apps/hooks/useAppBuildPoller', () => ({
    useAppBuildPoller: vi.fn(),
}));
vi.mock('../features/apps/hooks/useUpdateApp', () => ({
    useUpdateApp: () => ({ mutate: vi.fn() }),
}));
vi.mock('../hooks/appearance/useOrganizationAppearance', () => ({
    useColorPalettes: () => ({ data: [] }),
}));
vi.mock('../hooks/appearance/useProjectColorPalette', () => ({
    useProjectColorPalette: () => ({ data: undefined }),
}));
vi.mock('../features/apps/components/AppPreview', () => ({
    default: ({ version }: { version: number }) => (
        <div data-testid="app-preview">{`preview-v${version}`}</div>
    ),
}));
vi.mock('../components/common/PromptComposer/PromptComposer', () => ({
    default: ({ placeholder }: { placeholder: string }) => (
        <input placeholder={placeholder} />
    ),
}));
vi.mock('../features/apps/hooks/useVizComposerAttachments', () => ({
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

const renderBuilder = (path: string) =>
    renderWithProviders(
        <MemoryRouter initialEntries={[path]}>
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
            </Routes>
        </MemoryRouter>,
    );

describe('ChartTypeBuilder', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setFlag(true);
        vi.mocked(useCanCreateDataApp).mockReturnValue(true);
        vi.mocked(useCanEditDataApp).mockReturnValue(true);
        vi.mocked(useDataAppVizBuild).mockReturnValue(buildStub());
        vi.mocked(useDataAppVisualization).mockReturnValue({
            data: undefined,
        } as ReturnType<typeof useDataAppVisualization>);
        setApp(null);
        vi.mocked(useAppVersionHistory).mockReturnValue(historyStub([], null));
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
        expect(screen.getByText('Or try one of these')).toBeInTheDocument();
        expect(
            screen.getByText('A funnel of signup steps'),
        ).toBeInTheDocument();
        expect(screen.queryByText('Preview in explorer')).toBeNull();
        // Nothing to configure before a schema exists.
        expect(screen.queryByText('Builder options · Generated')).toBeNull();
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
        expect(
            screen.getByText('Builder options · Generated'),
        ).toBeInTheDocument();
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

        // The chart dims under the building pill; the options stay usable.
        expect(screen.getByLabelText('Show grid')).toBeInTheDocument();
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
            screen.getByPlaceholderText('Describe a new chart type…'),
        ).toBeInTheDocument();
        // First build: the skeleton state echoes what was asked for.
        expect(
            screen.getByText('Building your chart type…'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('“a stream graph of category share”'),
        ).toBeInTheDocument();
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
        expect(screen.getByLabelText('View v1')).toBeInTheDocument();
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
        expect(
            screen.getByPlaceholderText('Ask for a change…'),
        ).toBeInTheDocument();
    });
});
