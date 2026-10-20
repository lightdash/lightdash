import { Ability } from '@casl/ability';
import {
    DashboardTileTypes,
    type Dashboard,
    type DashboardTab,
    type DashboardTile,
    type PossibleAbilities,
} from '@lightdash/common';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { type Layout } from 'react-grid-layout';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LightdashApi } from '../api';
import { AbilityContext } from '../providers/Ability/context';
import { manageChartRule } from '../testing/savedChartResponse.mock';
import { renderWithProviders } from '../testing/testUtils';

// Real DashboardProvider, page and react-query; only the network and the
// header/grid UI are replaced. Pins the edit lifecycle across the store move.

const mockedApi = mockedLightdashApi;

const PROJECT_UUID = 'project-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';

const tile = (uuid: string, tabUuid?: string, x = 0): DashboardTile => ({
    uuid,
    type: DashboardTileTypes.SAVED_CHART,
    x,
    y: 0,
    w: 6,
    h: 3,
    tabUuid,
    properties: {
        savedChartUuid: `chart-${uuid}`,
        title: uuid,
        belongsToDashboard: false,
    },
});

const target = {
    controlUuid: 'control-1',
    fieldId: 'orders_date',
    tableName: 'orders',
};

const makeDashboard = (overrides: Partial<Dashboard> = {}): Dashboard => ({
    organizationUuid: 'org-uuid',
    projectUuid: PROJECT_UUID,
    dashboardVersionId: 1,
    versionUuid: 'version-uuid',
    uuid: DASHBOARD_UUID,
    name: 'Payments',
    verification: null,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    tiles: [tile('tile-1'), tile('tile-2', undefined, 6)],
    filters: { dimensions: [], metrics: [], tableCalculations: [] },
    spaceUuid: 'space-uuid',
    spaceName: 'Space',
    views: 0,
    firstViewedAt: null,
    pinnedListUuid: null,
    pinnedListOrder: null,
    tabs: [],
    inheritsFromOrgOrProject: false,
    access: null,
    slug: 'payments',
    colorPaletteUuid: null,
    owner: null,
    config: {
        isDateZoomDisabled: false,
        pinnedParameters: [],
        dateZoomConfig: {
            controls: [{ uuid: 'control-1', name: 'Zoom', granularity: 'MONTH' }],
            tileTargets: { 'tile-1': target },
        },
    },
    ...overrides,
});

const server = vi.hoisted(() => ({
    dashboard: undefined as unknown,
    patchResponse: undefined as unknown,
    patchError: undefined as unknown,
}));

vi.mock('../api');
vi.mock('../hooks/useContentAuthoringEnabled', () => ({
    useContentAuthoringEnabled: () => true,
}));
vi.mock('../providers/Dashboard/DashboardAiAgentContextBridge', () => ({
    default: () => null,
}));

type HeaderProps = {
    hasDashboardChanged: boolean;
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    dashboardTabs: DashboardTab[];
    onSaveDashboard: () => void;
    onCancel: () => void;
    onEditClicked: () => void;
    onSwitchTab: (tab: DashboardTab) => void;
};
vi.mock('../components/common/Dashboard/DashboardHeader', () => ({
    default: (props: HeaderProps) => (
        <div>
            <output data-testid="changed">
                {String(props.hasDashboardChanged)}
            </output>
            <output data-testid="active-tab">{props.activeTabUuid}</output>
            <output data-testid="tabs">
                {JSON.stringify(props.dashboardTabs)}
            </output>
            <button type="button" onClick={props.onSaveDashboard}>
                Save
            </button>
            <button type="button" onClick={props.onCancel}>
                Cancel
            </button>
            <button type="button" onClick={props.onEditClicked}>
                Edit
            </button>
            {props.dashboardTabs.map((tab) => (
                <button
                    key={tab.uuid}
                    type="button"
                    onClick={() => props.onSwitchTab(tab)}
                >
                    Switch to {tab.name}
                </button>
            ))}
        </div>
    ),
}));

type TabsProps = {
    dashboardTiles: DashboardTile[] | undefined;
    handleUpdateTiles: (layout: Layout[]) => void;
    handleDeleteTile: (tile: DashboardTile) => void;
    handleBatchDeleteTiles: (tiles: DashboardTile[]) => void;
    handleEditTile: (tile: DashboardTile) => void;
    handleAddTiles: (
        tiles: DashboardTile[],
        mapping?: Record<string, string>,
    ) => void;
};
vi.mock('../features/dashboardTabs', () => ({
    default: (props: TabsProps) => (
        <div>
            <output data-testid="tiles">
                {JSON.stringify(props.dashboardTiles ?? null)}
            </output>
            <button
                type="button"
                onClick={() =>
                    props.handleUpdateTiles([
                        { i: 'tile-1', x: 2, y: 4, w: 8, h: 5 },
                        { i: 'tile-2', x: 6, y: 0, w: 6, h: 3 },
                    ])
                }
            >
                Drag tile-1
            </button>
            <button
                type="button"
                onClick={() =>
                    props.handleUpdateTiles([
                        { i: 'tile-1', x: 0, y: 0, w: 6, h: 3 },
                        { i: 'tile-2', x: 6, y: 0, w: 6, h: 3 },
                    ])
                }
            >
                Drop in place
            </button>
            <button
                type="button"
                onClick={() => {
                    const target = props.dashboardTiles?.find(
                        (t) => t.uuid === 'tile-1',
                    );
                    if (target) props.handleDeleteTile(target);
                }}
            >
                Delete tile-1
            </button>
            <button
                type="button"
                onClick={() =>
                    props.handleBatchDeleteTiles(props.dashboardTiles ?? [])
                }
            >
                Delete all
            </button>
            <button
                type="button"
                onClick={() =>
                    props.handleEditTile({
                        ...tile('tile-2', undefined, 6),
                        properties: {
                            ...tile('tile-2').properties,
                            title: 'Renamed',
                        },
                    } as DashboardTile)
                }
            >
                Rename tile-2
            </button>
            <button
                type="button"
                onClick={() => props.handleAddTiles([tile('tile-new')])}
            >
                Add tile
            </button>
            <button
                type="button"
                onClick={() =>
                    props.handleAddTiles([tile('tile-copy')], {
                        'tile-copy': 'tile-1',
                    })
                }
            >
                Duplicate tile-1
            </button>
        </div>
    ),
}));

// The in-dashboard chart editor is flagged off here
vi.mock('../components/DashboardTiles/DashboardChartEditorModal', () => ({
    default: () => null,
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../features/contentAsCode/hooks/useContentDrafts', () => ({
    useReopenDraftMutation: () => ({ mutate: vi.fn(), isLoading: false }),
    useRebaseDraftMutation: () => ({ mutate: vi.fn(), isLoading: false }),
    useDraftStaleness: () => ({ data: undefined }),
}));
vi.mock('../features/comments', () => ({
    useDashboardCommentsCheck: () => ({
        canViewDashboardComments: false,
        canCreateDashboardComments: false,
    }),
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../hooks/organization/useOrganization', () => ({
    useOrganization: () => ({ data: undefined }),
}));
vi.mock('../hooks/useContent', () => ({
    useContentAction: () => ({ mutateAsync: vi.fn(), isLoading: false }),
}));
vi.mock('../hooks/useRecordContentView', () => ({
    useRecordContentView: vi.fn(),
}));
vi.mock('../providers/Fullscreen/useNativeFullscreenToggle', () => ({
    default: () => ({ isFullscreen: false, toggleFullscreen: vi.fn() }),
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => PROJECT_UUID,
}));
vi.mock('../hooks/useProjectRoute', () => ({
    useOptionalProjectRoute: () => undefined,
    useProjectUrlIdentifier: () => PROJECT_UUID,
}));
vi.mock('../features/parameters', () => ({
    useParameters: () => ({ data: undefined }),
}));
vi.mock('../hooks/toaster/useToaster', () => ({
    default: () => ({
        showToastSuccess: vi.fn(),
        showToastError: vi.fn(),
        showToastApiError: vi.fn(),
        showToastInfo: vi.fn(),
        showToastWarning: vi.fn(),
    }),
}));
vi.mock('../ee/providers/Embed/useEmbed', () => ({
    default: () => ({ projectUuid: PROJECT_UUID }),
}));

import { mockedLightdashApi } from '../testing/mockedLightdashApi';
// eslint-disable-next-line import/first
import DashboardPage from './Dashboard';

const ability = new Ability<PossibleAbilities>([
    manageChartRule,
    { action: 'manage', subject: 'Dashboard' },
]);

let queryClient: QueryClient;
const Probe = () => {
    queryClient = useQueryClient();
    const location = useLocation();
    return <output data-testid="url">{location.pathname}</output>;
};

const DASHBOARD_PATH = `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}`;
// Save and cancel return to the slug URL, which remounts the provider
const SLUG_PATH = `/projects/${PROJECT_UUID}/dashboards/payments`;

const renderDashboard = (path: string) => {
    const element = (
        <>
            <Probe />
            <DashboardPage />
        </>
    );
    const router = createMemoryRouter(
        [
            {
                path: '/projects/:projectUuid/dashboards/:dashboardUuid/:mode?',
                element,
            },
            {
                path: '/projects/:projectUuid/dashboards/:dashboardUuid/:mode/tabs/:tabUuid?',
                element,
            },
        ],
        { initialEntries: [path] },
    );
    renderWithProviders(
        <AbilityContext.Provider value={ability}>
            <RouterProvider router={router} />
        </AbilityContext.Provider>,
        { user: { abilityRules: ability.rules } },
    );
    return router;
};

const patches = () =>
    mockedApi.mock.calls
        .filter(([request]) => request.method === 'PATCH')
        .map(([request]) => JSON.parse(request.body as string));
const dashboardGets = () =>
    mockedApi.mock.calls.filter(
        ([request]) =>
            request.method === 'GET' &&
            request.url.startsWith(
                `/projects/${PROJECT_UUID}/dashboards/${DASHBOARD_UUID}`,
            ),
    ).length;

const tiles = () =>
    JSON.parse(screen.getByTestId('tiles').textContent ?? 'null') as
        | DashboardTile[]
        | null;
const changed = () => screen.getByTestId('changed').textContent;
const url = () => screen.getByTestId('url').textContent;
const click = (name: string) =>
    userEvent.click(screen.getByRole('button', { name }));

const waitForLoaded = async () => {
    await waitFor(() => expect(tiles()).not.toBeNull());
};

beforeEach(() => {
    sessionStorage.clear();
    server.dashboard = makeDashboard();
    server.patchError = undefined;
    server.patchResponse = undefined;
    mockedApi.mockReset();
    mockedApi.mockImplementation((async ({ url: requestUrl, method, body }) => {
        if (
            method === 'GET' &&
            requestUrl.startsWith(`/projects/${PROJECT_UUID}/dashboards/`)
        ) {
            return structuredClone(server.dashboard);
        }
        if (method === 'PATCH') {
            if (server.patchError) throw server.patchError;
            const update = JSON.parse(body as string);
            const saved = {
                ...(server.dashboard as Dashboard),
                ...update,
                ...((server.patchResponse as Partial<Dashboard>) ?? {}),
            };
            server.dashboard = saved;
            return structuredClone(saved);
        }
        if (requestUrl === '/dashboards/availableFilters') {
            return {
                savedQueryFilters: {},
                savedQueryMetricFilters: {},
                allFilterableFields: [],
                allFilterableMetrics: [],
            };
        }
        return new Promise(() => {});
    }) as LightdashApi);
});

afterEach(() => {
    sessionStorage.clear();
});

describe('edit lifecycle: layout edits and save', () => {
    it('starts clean, marks a drag dirty and saves the exact payload', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();
        expect(changed()).toBe('false');

        await click('Drag tile-1');
        expect(changed()).toBe('true');
        expect(tiles()?.[0]).toMatchObject({ x: 2, y: 4, w: 8, h: 5 });
        // Untouched tiles keep their identity-equivalent content
        expect(tiles()?.[1]).toEqual(tile('tile-2', undefined, 6));

        await click('Save');
        await waitFor(() => expect(patches()).toHaveLength(1));
        expect(patches()[0]).toEqual({
            tiles: [
                { ...tile('tile-1'), x: 2, y: 4, w: 8, h: 5 },
                tile('tile-2', undefined, 6),
            ],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
            name: 'Payments',
            tabs: [],
            config: {
                isDateZoomDisabled: false,
                isAddFilterDisabled: false,
                pinnedParameters: [],
                dateZoomConfig: {
                    controls: [
                        { uuid: 'control-1', name: 'Zoom', granularity: 'MONTH' },
                    ],
                    tileTargets: { 'tile-1': target },
                },
            },
            parameters: {},
        });

        await waitFor(() => expect(url()).toBe(`${SLUG_PATH}/view`));
        await waitFor(() => expect(changed()).toBe('false'));
    });

    it('a drop back in place still marks the dashboard dirty', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Drop in place');
        expect(changed()).toBe('true');
        expect(tiles()).toEqual(makeDashboard().tiles);
    });

    it('keeps the draft and stays in edit mode when the save fails', async () => {
        server.patchError = {
            status: 'error',
            error: { name: 'Error', statusCode: 500, message: 'boom' },
        };
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Drag tile-1');
        await click('Save');
        await waitFor(() => expect(patches()).toHaveLength(1));
        // Give the failed mutation time to settle
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });

        expect(url()).toBe(`${DASHBOARD_PATH}/edit`);
        expect(changed()).toBe('true');
        expect(tiles()?.[0]).toMatchObject({ x: 2, y: 4, w: 8, h: 5 });

        server.patchError = undefined;
        await click('Save');
        await waitFor(() => expect(patches()).toHaveLength(2));
        expect(patches()[1]).toEqual(patches()[0]);
        await waitFor(() => expect(url()).toBe(`${SLUG_PATH}/view`));
    });

    it('takes tiles from the save response when the server rewrites them', async () => {
        server.patchResponse = { tiles: [tile('server-tile')] };
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Drag tile-1');
        await click('Save');
        await waitFor(() =>
            expect(tiles()?.map((t) => t.uuid)).toEqual(['server-tile']),
        );
    });
});

describe('edit lifecycle: cancel', () => {
    it('restores saved tiles, clears dirty state and returns to view', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Drag tile-1');
        await click('Rename tile-2');
        await click('Add tile');
        expect(tiles()).toHaveLength(3);

        await click('Cancel');
        await waitFor(() => expect(url()).toBe(`${SLUG_PATH}/view`));
        expect(tiles()).toEqual(makeDashboard().tiles);
        expect(changed()).toBe('false');
        expect(patches()).toHaveLength(0);
    });
});

describe('edit lifecycle: tiles', () => {
    it('adds, renames and deletes tiles and saves the result', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Add tile');
        await click('Rename tile-2');
        await click('Delete tile-1');
        expect(tiles()?.map((t) => t.uuid)).toEqual(['tile-2', 'tile-new']);
        expect(changed()).toBe('true');

        await click('Save');
        await waitFor(() => expect(patches()).toHaveLength(1));
        const [payload] = patches();
        expect(payload.tiles.map((t: DashboardTile) => t.uuid)).toEqual([
            'tile-2',
            'tile-new',
        ]);
        expect(payload.tiles[0].properties.title).toBe('Renamed');
        // New tiles go one row below the lowest tile origin
        expect(payload.tiles[1].y).toBe(1);
        // Deleting the only targeted tile drops its date zoom target and the
        // now-empty control
        expect(payload.config.dateZoomConfig).toBeUndefined();
    });

    it('copies the source date zoom target onto a duplicated tile', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Duplicate tile-1');
        await click('Save');
        await waitFor(() => expect(patches()).toHaveLength(1));
        expect(patches()[0].config.dateZoomConfig.tileTargets).toEqual({
            'tile-1': target,
            'tile-copy': target,
        });
    });

    it('batch delete empties the dashboard', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();

        await click('Delete all');
        expect(tiles()).toEqual([]);
        expect(changed()).toBe('true');
    });
});

describe('edit lifecycle: tabs', () => {
    const tabs: DashboardTab[] = [
        { uuid: 'tab-b', name: 'B', order: 1 },
        { uuid: 'tab-a', name: 'A', order: 0 },
    ];

    it('sorts tabs, follows the URL tab and stamps added tiles with the active tab', async () => {
        server.dashboard = makeDashboard({
            tabs,
            tiles: [tile('tile-1', 'tab-a'), tile('tile-2', 'tab-b', 6)],
        });
        renderDashboard(`${DASHBOARD_PATH}/edit/tabs/tab-b`);
        await waitForLoaded();

        expect(
            JSON.parse(screen.getByTestId('tabs').textContent ?? '[]').map(
                (t: DashboardTab) => t.uuid,
            ),
        ).toEqual(['tab-a', 'tab-b']);
        await waitFor(() =>
            expect(screen.getByTestId('active-tab').textContent).toBe(
                'tab-b',
            ),
        );

        await click('Add tile');
        expect(tiles()?.find((t) => t.uuid === 'tile-new')?.tabUuid).toBe(
            'tab-b',
        );

        await click('Save');
        await waitFor(() => expect(patches()).toHaveLength(1));
        expect(patches()[0].tabs).toEqual([
            { uuid: 'tab-a', name: 'A', order: 0 },
            { uuid: 'tab-b', name: 'B', order: 1 },
        ]);
        await waitFor(() =>
            expect(url()).toBe(`${SLUG_PATH}/view/tabs/tab-b`),
        );
    });

    it('falls back to the first visible tab in view mode', async () => {
        server.dashboard = makeDashboard({
            tabs: [
                { uuid: 'tab-a', name: 'A', order: 0, hidden: true },
                { uuid: 'tab-b', name: 'B', order: 1 },
            ],
        });
        renderDashboard(`${DASHBOARD_PATH}/view/tabs/tab-a`);
        await waitForLoaded();
        await waitFor(() =>
            expect(screen.getByTestId('active-tab').textContent).toBe(
                'tab-b',
            ),
        );
    });

    it('switching tabs does not mark the dashboard dirty', async () => {
        server.dashboard = makeDashboard({ tabs });
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();
        await waitFor(() =>
            expect(screen.getByTestId('active-tab').textContent).toBe(
                'tab-a',
            ),
        );

        await click('Switch to B');
        expect(screen.getByTestId('active-tab').textContent).toBe('tab-b');
        expect(changed()).toBe('false');
    });
});

describe('edit lifecycle: refetches and drafts', () => {
    it('keeps in-progress edits through a no-op background refetch', async () => {
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();
        await click('Drag tile-1');
        const getsBefore = dashboardGets();

        await act(async () => {
            await queryClient.invalidateQueries(['saved_dashboard_query']);
        });
        await waitFor(() =>
            expect(dashboardGets()).toBeGreaterThan(getsBefore),
        );

        expect(changed()).toBe('true');
        expect(tiles()?.[0]).toMatchObject({ x: 2, y: 4, w: 8, h: 5 });
    });

    it('restores unsaved tiles and tabs from session storage as a dirty draft', async () => {
        const draftTiles = [tile('draft-tile', 'tab-a')];
        const draftTabs = [{ uuid: 'tab-a', name: 'Draft tab', order: 0 }];
        sessionStorage.setItem(
            `unsavedDashboardTiles:${DASHBOARD_UUID}`,
            JSON.stringify(draftTiles),
        );
        sessionStorage.setItem(
            `dashboardTabs:${DASHBOARD_UUID}`,
            JSON.stringify(draftTabs),
        );
        renderDashboard(`${DASHBOARD_PATH}/edit`);

        await waitFor(() =>
            expect(tiles()?.map((t) => t.uuid)).toEqual(['draft-tile']),
        );
        expect(changed()).toBe('true');
        expect(
            JSON.parse(screen.getByTestId('tabs').textContent ?? '[]'),
        ).toEqual(draftTabs);
        expect(
            sessionStorage.getItem(`unsavedDashboardTiles:${DASHBOARD_UUID}`),
        ).toBeNull();
        expect(
            sessionStorage.getItem(`dashboardTabs:${DASHBOARD_UUID}`),
        ).toBeNull();
    });

    it('warns before unload only while there are unsaved tile edits', async () => {
        const addListener = vi.spyOn(window, 'addEventListener');
        const unloadMessage = () => {
            const handlers = addListener.mock.calls.filter(
                ([type]) => type === 'beforeunload',
            );
            const latest = handlers[handlers.length - 1][1] as (
                event: { returnValue?: string },
            ) => string | undefined;
            return latest({});
        };
        renderDashboard(`${DASHBOARD_PATH}/edit`);
        await waitForLoaded();
        expect(unloadMessage()).toBeUndefined();

        await click('Drag tile-1');
        expect(unloadMessage()).toBe(
            'You have unsaved changes to your dashboard! Are you sure you want to leave without saving?',
        );
        addListener.mockRestore();
    });
});
