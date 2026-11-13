import { resolveTileDateZoom, type Dashboard } from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, type FC } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    dashboardDateZoomActions,
    dashboardEditActions,
    dashboardParametersActions,
    selectControlSections,
    selectControlGranularities,
    selectDashboardFilters,
    selectDateZoomGranularity,
    selectIsDateZoomDisabled,
    selectParameterPicks,
    selectRawTemporaryFilters,
    useDashboardDateZoomConfig,
    useDashboardDateZoomGranularities,
    useDashboardDispatch,
    useDashboardSelector,
    type DashboardStoreDispatch,
} from '../../../../../features/dashboard/store';
import DashboardProvider from '../../../../../providers/Dashboard/DashboardProvider';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboard from './EmbedDashboard';

const mocks = vi.hoisted(() => ({
    isFlagEnabled: true,
    draftsOnExit: false,
    availableFilters: undefined as unknown,
    dispatch: undefined as DashboardStoreDispatch | undefined,
    embed: {} as Record<string, unknown>,
    updateDashboard: vi.fn(),
    onUpdateSuccess: undefined as ((dashboard: unknown) => void) | undefined,
    setTemporaryFilters: undefined as ((filters: unknown) => void) | undefined,
    committedFilterIds: [] as string[],
}));

// The chart editor's SQL editor is never opened here
vi.mock('../../../../../components/MonacoEditor', () => ({
    default: () => null,
    Editor: () => null,
    useMonaco: () => null,
}));
vi.mock('../../../../providers/Embed/useEmbed', () => ({
    default: () => mocks.embed,
}));
vi.mock(
    '../../../../../hooks/dashboard/useDashboard',
    async (importActual) => ({
        ...(await importActual<object>()),
        useDashboardQuery: () => ({
            data: undefined,
            isInitialLoading: false,
            error: null,
        }),
        useDashboardVersionRefresh: () => ({
            mutateAsync: vi.fn(),
            isLoading: false,
        }),
        useDashboardsAvailableFilters: () => ({
            data: mocks.availableFilters,
            isInitialLoading: false,
            isFetching: false,
        }),
        useUpdateDashboard: (
            _uuid: unknown,
            _projectUuid: unknown,
            _showToast: unknown,
            onSuccess: (dashboard: unknown) => void,
        ) => {
            mocks.onUpdateSuccess = onSuccess;
            return { mutate: mocks.updateDashboard, isLoading: false };
        },
    }),
);
vi.mock('../hooks', async (importActual) => ({
    ...(await importActual<object>()),
    useEmbedDashboard: () => ({ data: undefined, error: null }),
    useEmbedSavedParameters: () => undefined,
}));
vi.mock('../../../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        data: { enabled: mocks.isFlagEnabled },
        isInitialLoading: false,
    }),
}));
// Each has its own tests; here only that the embed mounts them
vi.mock(
    '../../../../../features/dashboardControls/ParameterTileOverlay',
    () => ({
        ParameterTileOverlays: () => <i data-testid="parameter-overlays" />,
    }),
);
vi.mock('../../../../../features/dashboardControls/ParameterTilesBar', () => ({
    ParameterTilesBar: () => <i data-testid="parameter-tiles-bar" />,
}));
vi.mock(
    '../../../../../features/dashboardControls/DateZoomTileOverlay',
    () => ({
        DateZoomTileOverlays: () => <i data-testid="date-zoom-overlays" />,
    }),
);
vi.mock('../../../../../features/dashboardControls/DateZoomTilesBar', () => ({
    DateZoomTilesBar: () => <i data-testid="date-zoom-tiles-bar" />,
}));
vi.mock('../../../../../hooks/toaster/useToaster', () => ({
    default: () => ({ showToastWarning: vi.fn(), showToastInfo: vi.fn() }),
}));
vi.mock('../../../../../features/comments', () => ({
    useGetComments: () => ({ data: undefined }),
}));
vi.mock('../../../../../features/parameters', async (importActual) => ({
    ...(await importActual<object>()),
    useParameters: () => ({ data: undefined }),
}));

const SPACE_UUID = 'space-1';

const dashboard = {
    uuid: 'dashboard-1',
    slug: 'sales',
    name: 'Sales',
    projectUuid: 'project-1',
    spaceUuid: SPACE_UUID,
    // A tile, so the grid and the controls bar render
    tiles: [
        {
            uuid: 'tile-1',
            type: 'markdown',
            x: 0,
            y: 0,
            w: 12,
            h: 3,
            tabUuid: undefined,
            properties: { title: 'Notes', content: 'Hello' },
        },
    ],
    tabs: [],
    filters: {
        dimensions: [
            {
                id: 'rule-1',
                label: 'Order date',
                operator: 'equals',
                target: { fieldId: 'orders_date', tableName: 'orders' },
                values: ['2024'],
                sectionId: 'a',
            },
        ],
        metrics: [],
        tableCalculations: [],
    },
    parameters: {},
    config: {
        isDateZoomDisabled: false,
        controlSections: [{ id: 'a', name: 'Dates' }],
    },
    canDateZoom: false,
    dashboardFiltersInteractivity: { enabled: 'all' },
    parameterInteractivity: { enabled: false },
} as unknown as Dashboard;

const SectionNames: FC = () => {
    const sections = useDashboardSelector(selectControlSections);
    return (
        <output data-testid="section-names">
            {sections.map(({ name }) => name).join(',')}
        </output>
    );
};

const FilterIds: FC = () => {
    const filters = useDashboardSelector(selectDashboardFilters);
    const temporaryFilters = useDashboardSelector(selectRawTemporaryFilters);
    mocks.setTemporaryFilters = useDashboardContext(
        (c) => c.setDashboardTemporaryFilters,
    ) as (filters: unknown) => void;
    const ids = [...filters.dimensions, ...temporaryFilters.dimensions]
        .map(({ id }) => id)
        .join(',');
    useEffect(() => {
        mocks.committedFilterIds.push(ids);
    }, [ids]);
    return <output data-testid="filter-ids">{ids}</output>;
};

// The parameters store: its mode, and whether a viewer's pick is still held
const ParametersState: FC = () => {
    mocks.dispatch = useDashboardDispatch();
    const isEditMode = useDashboardSelector(
        (state) => state.parameters.isEditMode,
    );
    const picks = useDashboardSelector(selectParameterPicks);
    const isDateZoomDisabled = useDashboardSelector(selectIsDateZoomDisabled);
    const zoom = useDashboardSelector(selectDateZoomGranularity);
    const grains = useDashboardDateZoomGranularities();
    const zoomPicks = useDashboardSelector(selectControlGranularities);
    const zoomConfig = useDashboardDateZoomConfig();
    // The date zoom tile-1 queries with, as the chart tile resolves it
    const tileZoom = resolveTileDateZoom({
        config: zoomConfig,
        tileUuid: 'tile-1',
        runtimeGranularities: zoomPicks,
        globalGranularity: zoom,
        defaultXAxisFieldId: undefined,
    });
    return (
        <>
            <output data-testid="tile-zoom">
                {tileZoom?.granularity ?? 'none'}
            </output>
            <output data-testid="grains">{grains.join(',')}</output>
            <output data-testid="zoom">{zoom ?? 'none'}</output>
            <output data-testid="parameters-state">
                {isEditMode ? 'edit' : 'view'}:{Object.keys(picks).join(',')}
            </output>
            <output data-testid="zoom-hidden">
                {String(isDateZoomDisabled)}
            </output>
        </>
    );
};

// Writes a section draft in the commit that leaves edit mode, before the
// embed's own effects, as the controls provider does when it applies an open
// edit on a mode change
const DraftOnExit: FC<{ isEditMode: boolean }> = ({ isEditMode }) => {
    const dispatch = useDashboardDispatch();
    const wasEditMode = useRef(isEditMode);
    useEffect(() => {
        if (mocks.draftsOnExit && wasEditMode.current && !isEditMode) {
            dispatch(
                dashboardEditActions.renameControlSection({
                    id: 'a',
                    name: 'Applied on exit',
                }),
            );
        }
        wasEditMode.current = isEditMode;
    }, [dispatch, isEditMode]);
    return null;
};

const embedElement = (isEditMode: boolean, loaded = dashboard) => (
    <MemoryRouter>
        {/* As the embed page mounts it */}
        <DashboardProvider
            embedToken="token"
            projectUuid="project-1"
            isEditModeExternal
        >
            <SectionNames />
            <FilterIds />
            <ParametersState />
            <DraftOnExit isEditMode={isEditMode} />
            <EmbedDashboard
                initialDashboard={
                    loaded as unknown as Parameters<
                        typeof EmbedDashboard
                    >[0]['initialDashboard']
                }
                isEditMode={isEditMode}
            />
        </DashboardProvider>
    </MemoryRouter>
);

const renderEmbed = (isEditMode: boolean, loaded = dashboard) =>
    renderWithProviders(embedElement(isEditMode, loaded));

describe('EmbedDashboard sections', () => {
    beforeEach(() => {
        mocks.isFlagEnabled = true;
        mocks.updateDashboard.mockReset();
        mocks.embed = {
            dashboardUuid: dashboard.uuid,
            dispatchEmbedEvent: vi.fn(),
            embedToken: 'token',
            embedWriteContext: {
                canUpdateDashboard: true,
                canCreateSavedChart: false,
            },
            languageMap: undefined,
            mode: 'direct',
            writeActions: { spaceUuid: SPACE_UUID },
            filters: undefined,
            t: () => undefined,
        };
    });

    it("shows the embed's dashboard sections on the viewer bar", async () => {
        renderEmbed(false);
        expect(
            await screen.findByRole('group', { name: 'Dates' }),
        ).toBeInTheDocument();
    });

    it("keeps the sections and each rule's section through an editor's save", async () => {
        renderEmbed(true);
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Dates',
            ),
        );

        // Any change enables Save
        const name = screen.getByDisplayValue('Sales');
        await userEvent.clear(name);
        await userEvent.type(name, 'Sales 2');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(mocks.updateDashboard).toHaveBeenCalledTimes(1);
        const payload = mocks.updateDashboard.mock.calls[0][0];
        expect(payload.config.controlSections).toEqual([
            { id: 'a', name: 'Dates' },
        ]);
        expect(
            payload.filters.dimensions.map(
                ({ sectionId }: { sectionId?: string }) => sectionId,
            ),
        ).toEqual(['a']);
    });

    it("keeps a viewer's added filter applied, once, through its save", async () => {
        renderEmbed(false);
        await waitFor(() =>
            expect(screen.getByTestId('filter-ids')).toHaveTextContent(
                'rule-1',
            ),
        );
        const viewerFilter = {
            id: 'viewer-city',
            operator: 'equals',
            target: { fieldId: 'orders_city', tableName: 'orders' },
            values: ['Porto'],
        };
        act(() =>
            mocks.setTemporaryFilters?.({
                dimensions: [viewerFilter],
                metrics: [],
                tableCalculations: [],
            }),
        );

        mocks.committedFilterIds = [];
        act(() =>
            mocks.onUpdateSuccess?.({
                ...dashboard,
                filters: {
                    ...dashboard.filters,
                    dimensions: [...dashboard.filters.dimensions, viewerFilter],
                },
            }),
        );

        await waitFor(() =>
            expect(screen.getByTestId('filter-ids').textContent).toBe(
                'rule-1,viewer-city',
            ),
        );
        expect(
            mocks.committedFilterIds.filter(
                (ids) => ids !== 'rule-1,viewer-city',
            ),
        ).toEqual([]);
    });
});

describe('EmbedDashboard editor controls', () => {
    const OVERLAYS = [
        'parameter-overlays',
        'parameter-tiles-bar',
        'date-zoom-overlays',
        'date-zoom-tiles-bar',
    ];
    const toolbarGuard = () =>
        document.querySelector('[data-embed-toolbar-guard]');
    const save = () => screen.getByRole('button', { name: 'Save' });

    beforeEach(() => {
        mocks.isFlagEnabled = true;
        mocks.availableFilters = undefined;
        mocks.draftsOnExit = false;
        mocks.updateDashboard.mockReset();
        mocks.embed = {
            dashboardUuid: dashboard.uuid,
            dispatchEmbedEvent: vi.fn(),
            embedToken: 'token',
            embedWriteContext: {
                canUpdateDashboard: true,
                canCreateSavedChart: false,
            },
            languageMap: undefined,
            mode: 'direct',
            writeActions: { spaceUuid: SPACE_UUID },
            filters: undefined,
            t: () => undefined,
        };
    });

    it("gives an editor in edit mode the app's editor bar and tile pickers", async () => {
        renderEmbed(true);
        // The editor's "..." menu, and its sections
        expect(
            await screen.findByRole('button', { name: 'Filter bar settings' }),
        ).toBeInTheDocument();
        // The real "Add filter", with the class contract
        expect(screen.getByRole('button', { name: 'Add filter' })).toHaveClass(
            'ld-dashboard-add-filter',
        );
        expect(
            screen.getByRole('group', { name: 'Dates' }),
        ).toBeInTheDocument();
        OVERLAYS.forEach((testId) =>
            expect(screen.getByTestId(testId)).toBeInTheDocument(),
        );
    });

    it('puts the parameters store in edit mode from the first commit, dropping viewer picks', async () => {
        renderEmbed(true);
        await waitFor(() =>
            expect(screen.getByTestId('parameters-state')).toHaveTextContent(
                'edit:',
            ),
        );
    });

    it("drops a viewer's parameter picks on entering edit mode, and leaves it on the way out", async () => {
        const { rerender } = renderEmbed(false);
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Dates',
            ),
        );
        act(() => {
            mocks.dispatch?.(
                dashboardParametersActions.setParameterPicks({
                    region: 'emea',
                }),
            );
        });
        expect(screen.getByTestId('parameters-state')).toHaveTextContent(
            'view:region',
        );
        const element = (isEditMode: boolean) => (
            <MemoryRouter>
                <DashboardProvider
                    embedToken="token"
                    projectUuid="project-1"
                    isEditModeExternal
                >
                    <SectionNames />
                    <FilterIds />
                    <ParametersState />
                    <EmbedDashboard
                        initialDashboard={
                            dashboard as unknown as Parameters<
                                typeof EmbedDashboard
                            >[0]['initialDashboard']
                        }
                        isEditMode={isEditMode}
                    />
                </DashboardProvider>
            </MemoryRouter>
        );
        rerender(element(true));
        await waitFor(() =>
            expect(screen.getByTestId('parameters-state').textContent).toBe(
                'edit:',
            ),
        );
        rerender(element(false));
        await waitFor(() =>
            expect(screen.getByTestId('parameters-state').textContent).toBe(
                'view:',
            ),
        );
    });

    it('locks the toolbar while a control is edited, so Save cannot drop the draft', async () => {
        // A field to filter by, so "Add filter" is enabled
        mocks.availableFilters = {
            savedQueryFilters: {},
            allFilterableFields: [
                {
                    name: 'date',
                    table: 'orders',
                    tableLabel: 'Orders',
                    label: 'Order date',
                    fieldType: 'dimension',
                    type: 'date',
                },
            ],
        };
        renderEmbed(true);
        expect(toolbarGuard()).not.toHaveAttribute('inert');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Add filter' }),
        );
        await waitFor(() => expect(toolbarGuard()).toHaveAttribute('inert'));
        expect(toolbarGuard()).toContainElement(save());
        // The app header's locked look: its rule draws Save as an outline
        expect(toolbarGuard()).toHaveAttribute('data-dashboard-header-guard');
        expect(save().className).toMatch(/save/);
    });

    it('locks the toolbar while the default zoom is edited', async () => {
        renderEmbed(true, {
            ...dashboard,
            canDateZoom: true,
        } as unknown as Dashboard);
        await userEvent.click(
            await screen.findByRole('button', { name: /^Default zoom/ }),
        );
        await waitFor(() => expect(toolbarGuard()).toHaveAttribute('inert'));
    });

    describe('date zoom on the way in and out of edit mode', () => {
        const withDefaultZoom = {
            ...dashboard,
            canDateZoom: true,
            config: { ...dashboard.config, defaultDateZoomGranularity: 'Week' },
        } as unknown as Dashboard;
        const zoom = () => screen.getByTestId('zoom').textContent;

        it('never applies the saved default to an embed mounted in edit mode', async () => {
            renderEmbed(true, withDefaultZoom);
            await waitFor(() =>
                expect(
                    screen.getByTestId('parameters-state'),
                ).toHaveTextContent('edit:'),
            );
            await screen.findByRole('group', { name: 'Dates' });
            await act(async () => {});
            expect(zoom()).toBe('none');
        });

        it("clears a viewer's pick on entering edit mode and restores the saved default on leaving", async () => {
            const { rerender } = renderEmbed(false, withDefaultZoom);
            await waitFor(() => expect(zoom()).toBe('Week'));
            act(() => {
                mocks.dispatch?.(
                    dashboardDateZoomActions.setGranularity('Month'),
                );
            });
            expect(zoom()).toBe('Month');

            rerender(embedElement(true, withDefaultZoom));
            await waitFor(() => expect(zoom()).toBe('none'));
            await act(async () => {});
            expect(zoom()).toBe('none');

            rerender(embedElement(false, withDefaultZoom));
            await waitFor(() => expect(zoom()).toBe('Week'));
        });
    });

    describe("a viewer's pick on a named date zoom", () => {
        const namedZoom = {
            ...dashboard,
            canDateZoom: true,
            config: {
                ...dashboard.config,
                dateZoomConfig: {
                    controls: [
                        {
                            uuid: 'z1',
                            name: 'Order grain',
                            granularity: 'Month',
                        },
                    ],
                    tileTargets: {
                        'tile-1': {
                            controlUuid: 'z1',
                            fieldId: 'orders_date',
                            tableName: 'orders',
                        },
                    },
                },
            },
        } as unknown as Dashboard;
        const tileZoom = () => screen.getByTestId('tile-zoom').textContent;
        const pickYear = () =>
            act(() => {
                mocks.dispatch?.(
                    dashboardDateZoomActions.setControlGranularity({
                        controlUuid: 'z1',
                        granularity: 'Year',
                    }),
                );
            });

        it('goes on entering edit mode, for good, as on the app', async () => {
            const { rerender } = renderEmbed(false, namedZoom);
            await waitFor(() => expect(tileZoom()).toBe('Month'));
            pickYear();
            expect(tileZoom()).toBe('Year');

            rerender(embedElement(true, namedZoom));
            await waitFor(() => expect(tileZoom()).toBe('Month'));
            expect(
                await screen.findByRole('button', {
                    name: /^Order grain is Month/,
                }),
            ).toBeInTheDocument();
            // Dropping the pick is no edit
            expect(save()).toBeDisabled();

            rerender(embedElement(false, namedZoom));
            await screen.findByRole('button', { name: /^Order grain is/ });
            await act(async () => {});
            expect(tileZoom()).toBe('Month');
        });

        it('stays through edit mode with the flag off', async () => {
            mocks.isFlagEnabled = false;
            const { rerender } = renderEmbed(false, namedZoom);
            await waitFor(() => expect(tileZoom()).toBe('Month'));
            pickYear();

            rerender(embedElement(true, namedZoom));
            await screen.findByDisplayValue('Sales');
            await act(async () => {});
            expect(tileZoom()).toBe('Year');
        });
    });

    describe('a host leaving edit mode without Cancel', () => {
        const renameSection = () =>
            act(() => {
                mocks.dispatch?.(
                    dashboardEditActions.renameControlSection({
                        id: 'a',
                        name: 'Periods',
                    }),
                );
            });
        const sectionNames = () => screen.getByTestId('section-names');

        it('drops the control drafts, as Cancel does', async () => {
            const { rerender } = renderEmbed(true);
            await waitFor(() =>
                expect(sectionNames()).toHaveTextContent('Dates'),
            );
            renameSection();
            expect(sectionNames()).toHaveTextContent('Periods');

            rerender(embedElement(false));
            await waitFor(() =>
                expect(sectionNames()).toHaveTextContent('Dates'),
            );
        });

        it('drops a draft the open editor applies as the mode changes', async () => {
            mocks.draftsOnExit = true;
            const { rerender } = renderEmbed(true);
            await waitFor(() =>
                expect(sectionNames()).toHaveTextContent('Dates'),
            );

            rerender(embedElement(false));
            await screen.findByRole('group', { name: 'Dates' });
            await act(async () => {});
            expect(sectionNames().textContent).toBe('Dates');
        });

        it('leaves the grains as a fresh load has them after Cancel, with no saved list', async () => {
            renderEmbed(true, {
                ...dashboard,
                canDateZoom: true,
            } as unknown as Dashboard);
            await waitFor(() =>
                expect(sectionNames()).toHaveTextContent('Dates'),
            );
            const loaded = screen.getByTestId('grains').textContent;
            expect(loaded).toContain('Day');
            expect(loaded).not.toMatch(/Second|Minute|Hour/);

            await userEvent.click(
                screen.getByRole('button', { name: 'Cancel' }),
            );
            await act(async () => {});
            expect(screen.getByTestId('grains').textContent).toBe(loaded);
            expect(save()).toBeDisabled();
        });

        it('keeps what a save just wrote', async () => {
            const { rerender } = renderEmbed(true);
            await waitFor(() =>
                expect(sectionNames()).toHaveTextContent('Dates'),
            );
            renameSection();
            const saved = {
                ...dashboard,
                config: {
                    ...dashboard.config,
                    controlSections: [{ id: 'a', name: 'Periods' }],
                },
            } as unknown as Dashboard;
            act(() => mocks.onUpdateSuccess?.(saved));

            rerender(embedElement(false, saved));
            await screen.findByRole('group', { name: 'Periods' });
            await act(async () => {});
            expect(sectionNames()).toHaveTextContent('Periods');
        });
    });

    describe('a dashboard with no tiles', () => {
        const empty = { ...dashboard, tiles: [] } as unknown as Dashboard;

        it("keeps the editor's bar, and the shipped filters for a viewer", async () => {
            const { rerender } = renderEmbed(true, empty);
            expect(
                await screen.findByRole('button', {
                    name: 'Filter bar settings',
                }),
            ).toBeInTheDocument();
            rerender(embedElement(false, empty));
            await waitFor(() =>
                expect(
                    screen.queryByRole('button', {
                        name: 'Filter bar settings',
                    }),
                ).not.toBeInTheDocument(),
            );
        });

        it('keeps an open edit and its bar when the last tile is deleted', async () => {
            mocks.availableFilters = {
                savedQueryFilters: {},
                allFilterableFields: [
                    {
                        name: 'date',
                        table: 'orders',
                        tableLabel: 'Orders',
                        label: 'Order date',
                        fieldType: 'dimension',
                        type: 'date',
                    },
                ],
            };
            renderEmbed(true);
            await userEvent.click(
                await screen.findByRole('button', { name: 'Add filter' }),
            );
            await waitFor(() =>
                expect(toolbarGuard()).toHaveAttribute('inert'),
            );
            act(() => {
                mocks.dispatch?.(dashboardEditActions.setTiles([]));
            });
            await screen.findByText('Empty dashboard');
            // The editor is still open on its bar, so the edit can be ended
            expect(
                screen.getByRole('button', { name: 'Filter bar settings' }),
            ).toBeInTheDocument();
            expect(
                document.querySelector('.ld-dashboard-control-editor'),
            ).not.toBeNull();
            // A press outside cancels the edit, as on any dashboard
            fireEvent.pointerDown(document.body);
            await waitFor(() =>
                expect(toolbarGuard()).not.toHaveAttribute('inert'),
            );
        });
    });

    it('enables Save on a control change, saves it, and Cancel puts it back', async () => {
        renderEmbed(true);
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Dates',
            ),
        );
        expect(save()).toBeDisabled();

        act(() => {
            mocks.dispatch?.(
                dashboardEditActions.renameControlSection({
                    id: 'a',
                    name: 'Periods',
                }),
            );
        });
        await waitFor(() => expect(save()).toBeEnabled());
        await userEvent.click(save());
        const payload = mocks.updateDashboard.mock.calls[0][0];
        expect(payload.config.controlSections).toEqual([
            { id: 'a', name: 'Periods' },
        ]);
        // Never seeded in the embed's store: as loaded
        expect(payload.config.isDateZoomDisabled).toBe(false);
        expect(payload.config.pinnedParameters).toBeUndefined();

        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Dates',
            ),
        );
        expect(save()).toBeDisabled();
    });

    it('settles the control drafts once the save lands', async () => {
        renderEmbed(true);
        await waitFor(() =>
            expect(screen.getByTestId('section-names')).toHaveTextContent(
                'Dates',
            ),
        );
        act(() => {
            mocks.dispatch?.(
                dashboardEditActions.renameControlSection({
                    id: 'a',
                    name: 'Periods',
                }),
            );
        });
        await waitFor(() => expect(save()).toBeEnabled());
        act(() =>
            mocks.onUpdateSuccess?.({
                ...dashboard,
                config: {
                    ...dashboard.config,
                    controlSections: [{ id: 'a', name: 'Periods' }],
                },
            }),
        );
        await waitFor(() => expect(save()).toBeDisabled());
        expect(screen.getByTestId('section-names')).toHaveTextContent(
            'Periods',
        );
    });

    describe('"Hide date zoom for viewers"', () => {
        // Saved hidden; the token decides whether the embed has date zoom
        const zoomDashboard = (canDateZoom: boolean) =>
            ({
                ...dashboard,
                canDateZoom,
                config: { ...dashboard.config, isDateZoomDisabled: true },
            }) as unknown as Dashboard;
        const openMenu = async () =>
            userEvent.click(
                await screen.findByRole('button', {
                    name: 'Filter bar settings',
                }),
            );
        const rename = async () => {
            const name = screen.getByDisplayValue('Sales');
            await userEvent.clear(name);
            await userEvent.type(name, 'Sales 2');
        };

        it('starts from the saved value and keeps it through an untouched save', async () => {
            renderEmbed(true, zoomDashboard(true));
            await waitFor(() =>
                expect(screen.getByTestId('zoom-hidden')).toHaveTextContent(
                    'true',
                ),
            );
            expect(save()).toBeDisabled();
            await rename();
            await userEvent.click(save());
            expect(
                mocks.updateDashboard.mock.calls[0][0].config
                    .isDateZoomDisabled,
            ).toBe(true);
        });

        it('saves the value the editor toggles to', async () => {
            renderEmbed(true, zoomDashboard(true));
            await openMenu();
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Show date zoom for viewers',
                }),
            );
            await waitFor(() => expect(save()).toBeEnabled());
            await userEvent.click(save());
            expect(
                mocks.updateDashboard.mock.calls[0][0].config
                    .isDateZoomDisabled,
            ).toBe(false);
        });

        it("keeps the editor's toggle when the last tile is deleted", async () => {
            renderEmbed(true, zoomDashboard(true));
            await openMenu();
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Show date zoom for viewers',
                }),
            );
            act(() => {
                mocks.dispatch?.(dashboardEditActions.setTiles([]));
            });
            await screen.findByText('Empty dashboard');
            expect(screen.getByTestId('zoom-hidden')).toHaveTextContent(
                'false',
            );
            await userEvent.click(save());
            expect(
                mocks.updateDashboard.mock.calls[0][0].config
                    .isDateZoomDisabled,
            ).toBe(false);
        });

        it("leaves an embed viewer's date zoom to the token, whatever is saved", async () => {
            renderEmbed(false, zoomDashboard(true));
            await waitFor(() =>
                expect(screen.getByTestId('section-names')).toHaveTextContent(
                    'Dates',
                ),
            );
            expect(screen.getByTestId('zoom-hidden')).toHaveTextContent(
                'false',
            );
        });

        it('leaves every date zoom item out where the token allows no date zoom, and the loaded value is saved', async () => {
            renderEmbed(true, zoomDashboard(false));
            await openMenu();
            expect(
                await screen.findByRole('menuitem', {
                    name: 'Hide Add filter for viewers',
                }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('menuitem', {
                    name: /date zoom/i,
                }),
            ).not.toBeInTheDocument();
            expect(screen.getByTestId('zoom-hidden')).toHaveTextContent(
                'false',
            );
            await rename();
            await userEvent.click(save());
            expect(
                mocks.updateDashboard.mock.calls[0][0].config
                    .isDateZoomDisabled,
            ).toBe(true);
        });
    });

    describe('what the token does not allow', () => {
        it('never enables Save from a parameter or date zoom draft the bar cannot show', async () => {
            // The fixture's token allows neither parameters nor date zoom
            renderEmbed(true);
            await screen.findByRole('button', { name: 'Filter bar settings' });
            act(() => {
                mocks.dispatch?.(
                    dashboardParametersActions.setHaveParameterControlsChanged(
                        true,
                    ),
                );
                mocks.dispatch?.(
                    dashboardEditActions.setHaveDateZoomGranularitiesChanged(
                        true,
                    ),
                );
            });
            await act(async () => {});
            expect(save()).toBeDisabled();
        });

        it('cannot remove a section that holds a parameter control the bar does not show', async () => {
            renderEmbed(true, {
                ...dashboard,
                config: {
                    ...dashboard.config,
                    parameterControls: [
                        {
                            id: 'region-control',
                            sectionId: 'a',
                            label: 'Region',
                            value: 'emea',
                            valueType: { type: 'string', multiple: false },
                            parameters: { region: 'all' },
                        },
                    ],
                },
            } as unknown as Dashboard);
            await userEvent.click(
                await screen.findByRole('button', { name: 'Dates menu' }),
            );
            expect(
                await screen.findByRole('menuitem', { name: 'Rename' }),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('menuitem', { name: /^Remove section/ }),
            ).not.toBeInTheDocument();
        });

        it('gives a viewer who may not add filters no way to add, remove or arrange', async () => {
            renderEmbed(false, {
                ...dashboard,
                dashboardFiltersInteractivity: {
                    enabled: 'all',
                    canAddFilters: false,
                },
            } as unknown as Dashboard);
            await screen.findByRole('group', { name: 'Dates' });
            [
                'Add filter',
                'Add',
                'Filter bar settings',
                'Add filter to Dates',
                'Dates menu',
                'New section',
                'Remove filter',
            ].forEach((name) =>
                expect(
                    screen.queryByRole('button', { name }),
                ).not.toBeInTheDocument(),
            );
            expect(
                document.querySelector('[data-controls-pill][draggable]'),
            ).toBeNull();
        });
    });

    describe('with the flag off', () => {
        beforeEach(() => {
            mocks.isFlagEnabled = false;
        });

        it('keeps the shipped editor, no guard, no pickers, and the store out of edit mode', async () => {
            renderEmbed(true);
            await screen.findByDisplayValue('Sales');
            expect(
                screen.queryByRole('button', { name: 'Filter bar settings' }),
            ).not.toBeInTheDocument();
            expect(toolbarGuard()).toBeNull();
            expect(save().className).not.toMatch(/save/);
            OVERLAYS.forEach((testId) =>
                expect(screen.queryByTestId(testId)).not.toBeInTheDocument(),
            );
            expect(screen.getByTestId('parameters-state')).toHaveTextContent(
                'view:',
            );
        });

        it('sends the save exactly as before the controls', async () => {
            renderEmbed(true);
            const name = await screen.findByDisplayValue('Sales');
            await waitFor(() =>
                expect(screen.getByTestId('filter-ids')).toHaveTextContent(
                    'rule-1',
                ),
            );
            // A control draft changes nothing with the flag off
            act(() => {
                mocks.dispatch?.(
                    dashboardEditActions.setRequiredFiltersNote('Note'),
                );
            });
            expect(save()).toBeDisabled();
            await userEvent.clear(name);
            await userEvent.type(name, 'Sales 2');
            await userEvent.click(save());

            expect(mocks.updateDashboard.mock.calls[0][0]).toEqual({
                tiles: dashboard.tiles,
                filters: dashboard.filters,
                name: 'Sales 2',
                tabs: [],
                config: {
                    ...dashboard.config,
                    isDateZoomDisabled: false,
                    isAddFilterDisabled: false,
                },
                parameters: dashboard.parameters,
            });
        });
    });
});
