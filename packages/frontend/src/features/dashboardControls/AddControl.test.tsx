import {
    DimensionType,
    FieldType,
    FilterOperator,
    type DashboardControlSection,
    type DashboardFilters,
    type DashboardParameterControl,
    type DashboardTile,
    type FilterableDimension,
    type ParameterDefinitions,
} from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type SqlChartTileMetadata } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    type DashboardEditTestValues,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { dashboardParametersActions } from '../dashboard/store';
import { AddControl } from './AddControl';
import { ParameterEditorProvider } from './ParameterEditorProvider';
import { ParameterPills } from './ParameterPills';

const mockSidebar = vi.hoisted(() => ({
    tileHoverOwner: { current: null as string | null },
    current: {
        isSidebarOpen: false,
        isViewer: false,
        canAddFilters: true,
        isNew: false,
        isPlaceholder: false,
        editingRule: null as { sectionId?: string } | null,
        openNew: vi.fn(),
    },
}));
const mockFilters = vi.hoisted(() => ({
    current: undefined as DashboardFilters | undefined,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockTileStatus = vi.hoisted(() => ({
    current: { sqlChartTilesMetadata: {} } as Record<string, unknown>,
}));
const renderWithProviders = (
    ui: ReactElement,
    controlSections: DashboardControlSection[] = [],
) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider
            store={seedDashboardEditState(
                createDashboardTestStore({
                    haveFiltersChanged: false,
                    dashboardFilters: mockFilters.current,
                    sqlChartTilesMetadata: mockTileStatus.current
                        .sqlChartTilesMetadata as Record<
                        string,
                        SqlChartTileMetadata
                    >,
                }),
                {
                    ...(mockDashboardContext.current as DashboardEditTestValues),
                    dashboard: {
                        config: { isDateZoomDisabled: false, controlSections },
                    },
                } as DashboardEditTestValues,
            )}
        >
            {ui}
        </DashboardStoreTestProvider>,
    );

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => {
        const context = {
            ...mockSidebar.current,
            tileHoverOwner: mockSidebar.tileHoverOwner,
        };
        return selector(context);
    },
}));
vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

describe('AddControl', () => {
    const add = () => screen.getByRole('button', { name: 'Add filter' });
    const setIsAddFilterDisabled = vi.fn();

    beforeEach(() => {
        setIsAddFilterDisabled.mockClear();
        mockSidebar.current = {
            isSidebarOpen: false,
            isViewer: false,
            canAddFilters: true,
            isNew: false,
            isPlaceholder: false,
            editingRule: null,
            openNew: vi.fn(),
        };
        mockFilters.current = undefined;
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFields: [],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            isAddFilterDisabled: false,
            setIsAddFilterDisabled,
        };
    });

    it('is the shipped button, found by the attributes focus returns to', () => {
        const { container } = renderWithProviders(<AddControl />);

        expect(
            container.querySelector(
                '[data-filter-actions] > button[data-dashboard-filter-control]',
            ),
        ).toBe(add());
    });

    it('opens no popover of its own', () => {
        renderWithProviders(<AddControl />);

        fireEvent.click(add());

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('anchors the editor of a new filter until its field is picked', () => {
        const editor = () => document.querySelector('[data-controls-editor]');
        const { unmount } = renderWithProviders(<AddControl />);
        expect(editor()).toBeNull();
        unmount();

        mockSidebar.current = {
            ...mockSidebar.current,
            isSidebarOpen: true,
            isNew: true,
            isPlaceholder: true,
        };
        const { unmount: unmountPicking } = renderWithProviders(<AddControl />);
        expect(editor()).not.toBeNull();
        unmountPicking();

        // Picked: the editor moves to the new filter's pill
        mockSidebar.current = { ...mockSidebar.current, isPlaceholder: false };
        renderWithProviders(<AddControl />);
        expect(editor()).toBeNull();
    });

    it("leaves a new filter started from a section's + to that +, unless the section is gone", () => {
        const editor = () => document.querySelector('[data-controls-editor]');
        mockSidebar.current = {
            ...mockSidebar.current,
            isSidebarOpen: true,
            isNew: true,
            isPlaceholder: true,
            editingRule: { sectionId: 's' },
        };
        const { unmount } = renderWithProviders(<AddControl />, [
            { id: 's', name: 'Dates' },
        ]);
        expect(editor()).toBeNull();
        unmount();

        renderWithProviders(<AddControl />);
        expect(editor()).not.toBeNull();
    });

    it('is "Add filter", which opens a new one, with a menu in place of the shipped eye', () => {
        mockFilters.current = {
            dimensions: [
                {
                    id: 'saved',
                    label: undefined,
                    operator: FilterOperator.EQUALS,
                    target: { fieldId: 'orders_status', tableName: 'orders' },
                    values: ['done'],
                },
            ],
            metrics: [],
            tableCalculations: [],
        };
        renderWithProviders(<AddControl />);
        expect(add().querySelector('svg')).toBeNull();
        expect(
            screen.queryByRole('button', {
                name: 'Toggle filter visibility for viewers',
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Filter rules' }),
        ).not.toBeInTheDocument();
        fireEvent.click(add());
        expect(mockSidebar.current.openNew).toHaveBeenCalledTimes(1);
    });

    it('is the trigger joined to the menu, with no caret between them', () => {
        const { container } = renderWithProviders(<AddControl />);
        const group = container.querySelector('[data-filter-actions]');
        const buttons = [...(group?.querySelectorAll('button') ?? [])];
        expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
            null,
            'Filter bar settings',
        ]);
    });

    const openMenu = () =>
        fireEvent.click(
            screen.getByRole('button', { name: 'Filter bar settings' }),
        );

    it('hides "Add filter" from viewers with an item named for the action, which closes the menu', async () => {
        renderWithProviders(<AddControl />);
        openMenu();
        const item = await screen.findByRole('menuitem', {
            name: 'Hide for viewers',
        });
        expect(screen.queryByRole('menuitemcheckbox')).not.toBeInTheDocument();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        expect(item.querySelector('.tabler-icon-eye-off')).not.toBeNull();

        fireEvent.click(item);

        expect(setIsAddFilterDisabled).toHaveBeenCalledTimes(1);
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
        await waitFor(() =>
            expect(
                screen.queryByRole('menuitem', {
                    name: 'Hide for viewers',
                }),
            ).not.toBeInTheDocument(),
        );
    });

    it('shows "Add filter" to viewers again while it is hidden from them', async () => {
        mockDashboardContext.current.isAddFilterDisabled = true;
        renderWithProviders(<AddControl />);
        openMenu();
        const item = await screen.findByRole('menuitem', {
            name: 'Show for viewers',
        });
        expect(item.querySelector('.tabler-icon-eye')).not.toBeNull();

        item.focus();
        await userEvent.keyboard('{Enter}');
        expect(setIsAddFilterDisabled).toHaveBeenCalledTimes(1);
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(false);
    });

    it('opens the shipped filter rules from the menu', async () => {
        renderWithProviders(<AddControl />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Filter bar settings' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Filter rules' }),
        );
        expect(
            await screen.findByText(
                "Dashboard won't load until all rules are met.",
            ),
        ).toBeInTheDocument();
    });

    describe('with filter rules', () => {
        beforeEach(() => {
            mockFilters.current = {
                dimensions: [
                    {
                        id: 'f1',
                        target: { fieldId: 'a', tableName: 't' },
                        operator: FilterOperator.EQUALS,
                        values: [],
                        disabled: true,
                        required: true,
                        label: undefined,
                    },
                ],
                metrics: [],
                tableCalculations: [],
            };
        });

        it('marks the "..." and counts them on the menu item, as the shipped button did', async () => {
            renderWithProviders(<AddControl />);
            expect(
                screen.getByRole('img', { name: '1 filter rule' }),
            ).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Filter bar settings' }),
            );
            expect(
                await screen.findByRole('menuitem', { name: 'Filter rules 1' }),
            ).toBeInTheDocument();
        });

        it('keeps staged rule edits while the menu is used, and toggles the rules from it', async () => {
            // The test env renders no portals; the bug needs the menu's
            renderWithProviders(
                <MantineProvider env="default">
                    <AddControl />
                </MantineProvider>,
            );
            const settings = () =>
                screen.getByRole('button', {
                    name: 'Filter bar settings',
                    hidden: true,
                });
            const note = () =>
                screen.getByLabelText<HTMLTextAreaElement>('Note for viewers');
            await userEvent.click(settings());
            // Hidden to jsdom: the menu's floating reference has no size
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: /Filter rules/,
                    hidden: true,
                }),
            );
            await userEvent.type(
                await screen.findByLabelText('Note for viewers'),
                'Pick a region',
            );

            await userEvent.click(settings());
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Hide for viewers',
                    hidden: true,
                }),
            );

            expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
            expect(note().value).toBe('Pick a region');

            // The item closed the menu, as the shipped pin item does
            await userEvent.click(settings());
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: /Filter rules/,
                    hidden: true,
                }),
            );
            await waitFor(() =>
                expect(
                    screen.queryByLabelText('Note for viewers'),
                ).not.toBeInTheDocument(),
            );
        });
    });

    it('shows no rules mark while there are none', () => {
        renderWithProviders(<AddControl />);
        expect(
            screen.queryByRole('img', { name: /filter rule/ }),
        ).not.toBeInTheDocument();
    });

    describe('for a viewer', () => {
        beforeEach(() => {
            mockSidebar.current.isViewer = true;
        });

        it('is the shipped view mode button on the bar: no eye or menu, opens the rail', () => {
            renderWithProviders(<AddControl />);
            expect(
                screen.queryByRole('button', {
                    name: 'Toggle filter visibility for viewers',
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Filter bar settings' }),
            ).not.toBeInTheDocument();
            fireEvent.click(add());
            expect(mockSidebar.current.openNew).toHaveBeenCalledTimes(1);
        });

        it('shows the tooltip it is given, as an embed passes it', async () => {
            renderWithProviders(
                <AddControl unsavedFiltersTooltip="Filters you add reset on reload" />,
            );
            fireEvent.mouseEnter(add());
            expect(
                await screen.findByText('Filters you add reset on reload'),
            ).toBeInTheDocument();
        });

        it('is gone while the editor hides it from viewers', () => {
            mockDashboardContext.current.isAddFilterDisabled = true;
            renderWithProviders(<AddControl />);
            expect(
                screen.queryByRole('button', { name: 'Add filter' }),
            ).not.toBeInTheDocument();
        });
    });

    it.each([false, true])(
        'is inert while a filter is edited, for a viewer too (%s)',
        (isViewer) => {
            mockSidebar.current.isViewer = isViewer;
            const { rerender } = renderWithProviders(<AddControl />);
            expect(add().closest('[inert]')).toBeNull();

            mockSidebar.current.isSidebarOpen = true;
            rerender(
                <DashboardStoreTestProvider store={createDashboardTestStore()}>
                    <AddControl />
                </DashboardStoreTestProvider>,
            );
            expect(add().closest('[inert]')).not.toBeNull();
            if (!isViewer)
                expect(
                    screen
                        .getByRole('button', {
                            name: 'Filter bar settings',
                            hidden: true,
                        })
                        .closest('[inert]'),
                ).not.toBeNull();
        },
    );

    it('is disabled until the filterable fields are available', () => {
        mockDashboardContext.current.allFilterableFields = undefined;
        renderWithProviders(<AddControl />);

        expect(add()).toBeDisabled();
        fireEvent.click(add());
        expect(mockSidebar.current.openNew).not.toHaveBeenCalled();
    });

    it('stays enabled without fields when a SQL chart tile reported columns', () => {
        mockDashboardContext.current.allFilterableFields = undefined;
        mockTileStatus.current = {
            sqlChartTilesMetadata: { 'tile-1': { columns: [] } },
        };
        renderWithProviders(<AddControl />);

        expect(add()).toBeEnabled();
    });

    it.each(['isLoadingDashboardFilters', 'isFetchingDashboardFilters'])(
        'shows a loader and opens nothing while %s',
        (flag) => {
            mockDashboardContext.current[flag] = true;
            renderWithProviders(<AddControl />);

            expect(add()).toHaveAttribute('data-loading', 'true');
            fireEvent.click(add());
            expect(mockSidebar.current.openNew).not.toHaveBeenCalled();
        },
    );
});

describe('AddControl with parameters', () => {
    const definitions: ParameterDefinitions = {
        'orders.region': {
            label: 'Region',
            type: 'string',
            options: ['EMEA', 'APAC'],
            default: 'EMEA',
        },
        'payments.region': {
            label: 'Region',
            type: 'string',
            options: ['EMEA', 'APAC'],
            default: 'EMEA',
        },
        fiscal_year_start: {
            label: 'Fiscal year starts',
            type: 'string',
            options: ['January', 'April'],
            default: 'January',
        },
    };
    const references = {
        'tile-1': ['orders.region', 'fiscal_year_start'],
        'tile-2': ['orders.region', 'payments.region'],
    };
    const ordersField: FilterableDimension = {
        fieldType: FieldType.DIMENSION,
        type: DimensionType.STRING,
        name: 'status',
        label: 'Status',
        table: 'orders',
        tableLabel: 'Orders',
        sql: '${TABLE}.status',
        hidden: false,
    };
    const openNew = vi.fn();
    const discard = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
            300,
        );
        vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(
            400,
        );
        mockFilters.current = undefined;
        mockTileStatus.current = { sqlChartTilesMetadata: {} };
        mockDashboardContext.current = {
            allFilterableFields: [ordersField],
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            isAddFilterDisabled: false,
            setIsAddFilterDisabled: vi.fn(),
        };
    });

    const setup = ({
        discoveryPending = false,
        isViewer = false,
        tileParameterReferences = references,
        controls = [],
        triggerClassName,
    }: {
        discoveryPending?: boolean;
        isViewer?: boolean;
        tileParameterReferences?: Record<string, string[]>;
        controls?: DashboardParameterControl[] | null;
        triggerClassName?: string;
    } = {}) => {
        mockSidebar.current = {
            ...mockSidebar.current,
            isViewer,
            isSidebarOpen: false,
            isNew: false,
            isPlaceholder: false,
            editingRule: null,
            openNew,
            discard,
        } as typeof mockSidebar.current;
        const store = createDashboardTestStore({
            isEditMode: !isViewer,
            parameterDefinitions: definitions,
            tileParameterReferences,
        });
        seedDashboardEditState(store, {
            ...(mockDashboardContext.current as DashboardEditTestValues),
            dashboardTiles: ['tile-1', 'tile-2'].map(
                (uuid) =>
                    ({
                        uuid,
                        type: 'saved_chart',
                        properties: discoveryPending
                            ? { savedChartUuid: `chart-${uuid}` }
                            : {},
                    }) as DashboardTile,
            ),
        } as DashboardEditTestValues);
        if (controls !== null) {
            store.dispatch(
                dashboardParametersActions.syncParameterControls({
                    controls,
                    isSaved: true,
                }),
            );
        }
        const user = userEvent.setup();
        renderWithAppProviders(
            <DashboardStoreTestProvider store={store}>
                <ParameterEditorProvider isViewer={isViewer}>
                    <AddControl triggerClassName={triggerClassName} />
                    <ParameterPills />
                </ParameterEditorProvider>
            </DashboardStoreTestProvider>,
        );
        return { user, store };
    };

    const openParameterPicker = async (
        user: ReturnType<typeof userEvent.setup>,
    ) => {
        await user.click(screen.getByRole('button', { name: 'Add' }));
        await user.click(
            await screen.findByRole('menuitem', { name: /^Parameter/ }),
        );
        return screen.findByRole('textbox', { name: 'Search parameters' });
    };

    it('says on the "Add" button itself that it opens a menu, and whether it is open', async () => {
        const { user } = setup();
        const button = screen.getByRole('button', { name: 'Add' });
        expect(button).toHaveAttribute('aria-haspopup', 'menu');
        expect(button).toHaveAttribute('aria-expanded', 'false');
        // Not on a wrapper around it
        expect(button.parentElement?.closest('[aria-expanded]')).toBeNull();
        await user.click(button);
        expect(button).toHaveAttribute('aria-expanded', 'true');
        await user.click(
            await screen.findByRole('menuitem', { name: /^Parameter/ }),
        );
        // The search is a dialog, not the menu the button announces
        expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('reads "Add" for an editor and asks Filter or Parameter first', async () => {
        const { user } = setup();
        await user.click(screen.getByRole('button', { name: 'Add' }));
        expect(
            await screen.findByRole('menuitem', { name: /^Filter/ }),
        ).toHaveTextContent('Narrow the data in tiles by a field');
        expect(
            screen.getByRole('menuitem', { name: /^Parameter/ }),
        ).toHaveTextContent('Set a value that tiles use');
        expect(openNew).not.toHaveBeenCalled();

        await user.click(screen.getByRole('menuitem', { name: /^Filter/ }));
        expect(openNew).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['a viewer', { isViewer: true }],
        [
            'an editor whose tiles use no parameter',
            { tileParameterReferences: {} },
        ],
    ])(
        'is "Add filter" for %s, opening the field search directly',
        async (_, options) => {
            const { user } = setup(options);
            expect(
                screen.queryByRole('button', { name: 'Add' }),
            ).not.toBeInTheDocument();
            await user.click(
                screen.getByRole('button', { name: 'Add filter' }),
            );
            expect(openNew).toHaveBeenCalledTimes(1);
            expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
        },
    );

    it('keeps parameter creation unavailable while controls are not loaded', async () => {
        const { user, store } = setup({ controls: null });
        expect(
            screen.queryByRole('button', { name: 'Add' }),
        ).not.toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Add filter' }));
        expect(openNew).toHaveBeenCalledTimes(1);
        expect(store.getState().parameters.parameterControls).toBeNull();
    });

    it('allows adding filters until every tile has been discovered, even with saved controls', async () => {
        const { store } = setup({ discoveryPending: true });
        const button = screen.getByRole('button', { name: 'Add filter' });
        expect(button).toBeEnabled();
        fireEvent.click(button);
        expect(openNew).toHaveBeenCalledTimes(1);
        expect(store.getState().parameters.parameterControls).toEqual([]);
        const sources = ['tile-1', 'tile-2'].map((tileUuid) => ({
            tileUuid,
            savedChartUuid: `chart-${tileUuid}`,
            savedSqlUuid: null,
        }));
        act(() => {
            store.dispatch(
                dashboardParametersActions.addDiscoveredParameterReferences({
                    references: { 'tile-1': references['tile-1'] },
                    definitions,
                    sources: { 'tile-1': JSON.stringify(sources[0]) },
                }),
            );
        });
        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeEnabled();
        act(() => {
            store.dispatch(
                dashboardParametersActions.addDiscoveredParameterReferences({
                    references,
                    definitions,
                    sources: Object.fromEntries(
                        sources.map((source) => [
                            source.tileUuid,
                            JSON.stringify(source),
                        ]),
                    ),
                }),
            );
        });
        expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled();
    });

    it('does not make a viewer wait for parameter discovery', () => {
        setup({ discoveryPending: true, isViewer: true });
        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeEnabled();
    });

    it('keeps an embed viewer\'s "Add filter" and its class contract', () => {
        setup({ isViewer: true, triggerClassName: 'ld-dashboard-add-filter' });
        expect(screen.getByRole('button', { name: 'Add filter' })).toHaveClass(
            'ld-dashboard-add-filter',
        );
    });

    it('lists each parameter once, by model with the project first, with its tiles', async () => {
        const { user } = setup();
        await expect(openParameterPicker(user)).resolves.toHaveFocus();
        expect(
            (await screen.findAllByRole('option')).map((option) =>
                option.getAttribute('aria-label'),
            ),
        ).toEqual([
            'Fiscal year starts, Project, 1 tile',
            'Region, Orders, 2 tiles',
            'Region, Payments, 1 tile',
        ]);

        // The model's name matches too
        await user.type(
            screen.getByRole('textbox', { name: 'Search parameters' }),
            'pay',
        );
        await waitFor(() =>
            expect(screen.getAllByRole('option')).toHaveLength(1),
        );
        await user.clear(
            screen.getByRole('textbox', { name: 'Search parameters' }),
        );
        await user.type(
            screen.getByRole('textbox', { name: 'Search parameters' }),
            'zzz',
        );
        expect(
            await screen.findByText('No matching parameters'),
        ).toBeInTheDocument();
    });

    it('goes back from the parameter search to the choice', async () => {
        const { user } = setup();
        await openParameterPicker(user);
        await user.click(screen.getByRole('button', { name: 'Back' }));
        expect(
            await screen.findByRole('menuitem', { name: /^Filter/ }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('textbox', { name: 'Search parameters' }),
        ).not.toBeInTheDocument();
    });

    it('closes the parameter search on Escape, adding nothing', async () => {
        const { user, store } = setup();
        await openParameterPicker(user);
        await user.keyboard('{Escape}');
        await waitFor(() =>
            expect(
                screen.queryByRole('textbox', { name: 'Search parameters' }),
            ).not.toBeInTheDocument(),
        );
        expect(store.getState().parameters.parameterControls).toEqual([]);
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus(),
        );
    });

    it('closes the parameter search on a click on "Add"', async () => {
        const { user } = setup();
        await openParameterPicker(user);
        await user.click(screen.getByRole('button', { name: 'Add' }));
        await waitFor(() =>
            expect(
                screen.queryByRole('textbox', { name: 'Search parameters' }),
            ).not.toBeInTheDocument(),
        );
        expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    });

    it('opens a new control on a pick, and Apply adds it on every tile using the parameter', async () => {
        const { user, store } = setup();
        await user.type(await openParameterPicker(user), 'orders');
        await waitFor(() =>
            expect(screen.getAllByRole('option')).toHaveLength(1),
        );
        await user.keyboard('{Enter}');

        const dialog = await screen.findByRole('dialog', { name: 'Region' });
        expect(dialog).toHaveTextContent('Sets 2 tiles');
        expect(store.getState().parameters.parameterControls).toEqual([]);
        await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
        expect(store.getState().parameters.parameterControls).toEqual([
            expect.objectContaining({
                label: null,
                valueType: { type: 'string', multiple: false },
                parameters: { 'orders.region': 'all' },
            }),
        ]);
    });

    it('drops a new control on Cancel', async () => {
        const { user, store } = setup();
        await user.type(await openParameterPicker(user), 'fiscal');
        await waitFor(() =>
            expect(screen.getAllByRole('option')).toHaveLength(1),
        );
        await user.keyboard('{Enter}');
        const dialog = await screen.findByRole('dialog', {
            name: 'Fiscal year starts',
        });
        await user.click(
            within(dialog).getByRole('button', { name: 'Cancel' }),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /^Fiscal year starts/ }),
        ).not.toBeInTheDocument();
        expect(store.getState().parameters.parameterControls).toEqual([]);
        // Its pill went with it: focus goes back to Add
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus(),
        );
    });

    it('a key held only by an explicit control starts with no tiles', async () => {
        const { user, store } = setup({
            controls: [
                {
                    id: 'first',
                    label: 'Region',
                    value: null,
                    valueType: { type: 'string', multiple: false },
                    parameters: { 'orders.region': { only: ['tile-1'] } },
                },
            ],
        });
        await openParameterPicker(user);
        await user.click(
            await screen.findByRole('option', {
                name: 'Region, Orders, 2 tiles',
            }),
        );
        const dialog = await screen.findByRole('dialog', { name: 'Region' });
        await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
        expect(
            store.getState().parameters.parameterControls?.[1],
        ).toMatchObject({ parameters: { 'orders.region': { only: [] } } });
        expect(
            store.getState().parameters.parameterControls?.[0].parameters,
        ).toEqual({ 'orders.region': { only: ['tile-1'] } });
    });

    it('allows a second control to be saved with no tiles', async () => {
        const { user, store } = setup({
            controls: [
                {
                    id: 'first',
                    label: 'Region',
                    value: null,
                    valueType: { type: 'string', multiple: false },
                    parameters: { 'orders.region': 'all' },
                },
            ],
        });
        await openParameterPicker(user);
        const onBar = await screen.findByRole('option', {
            name: 'Region, Orders, 2 tiles',
        });
        expect(onBar).not.toHaveAttribute('data-combobox-disabled');
        await user.click(onBar);

        const dialog = await screen.findByRole('dialog', {
            // Both set Orders Region: the model tells them nothing apart
            name: 'Region',
        });
        expect(dialog).toHaveTextContent('Sets 0 of 2 tiles');
        await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
        expect(
            store.getState().parameters.parameterControls?.[1],
        ).toMatchObject({
            parameters: { 'orders.region': { only: [] } },
        });
    });

    it('starts a second control unset even when the dashboard has a value', async () => {
        const { user, store } = setup({
            controls: [
                {
                    id: 'first',
                    label: 'Region',
                    value: 'APAC',
                    valueType: { type: 'string', multiple: false },
                    parameters: { 'orders.region': 'all' },
                },
            ],
        });
        act(() => {
            store.dispatch(
                dashboardParametersActions.setParameter({
                    key: 'orders.region',
                    value: 'APAC',
                }),
            );
        });
        await openParameterPicker(user);
        await user.click(
            await screen.findByRole('option', {
                name: 'Region, Orders, 2 tiles',
            }),
        );
        const dialog = await screen.findByRole('dialog', { name: 'Region' });
        await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
        expect(
            store.getState().parameters.parameterControls?.[1],
        ).toMatchObject({
            value: null,
            parameters: { 'orders.region': { only: [] } },
        });
    });

    it('prefills the first control from the dashboard value', async () => {
        const { user, store } = setup();
        act(() => {
            store.dispatch(
                dashboardParametersActions.setParameter({
                    key: 'orders.region',
                    value: 'APAC',
                }),
            );
        });
        await openParameterPicker(user);
        await user.click(
            await screen.findByRole('option', {
                name: 'Region, Orders, 2 tiles',
            }),
        );
        const dialog = await screen.findByRole('dialog', { name: 'Region' });
        await user.click(within(dialog).getByRole('button', { name: 'Apply' }));
        expect(
            store.getState().parameters.parameterControls?.[0],
        ).toMatchObject({
            value: 'APAC',
            parameters: { 'orders.region': 'all' },
        });
    });
});
