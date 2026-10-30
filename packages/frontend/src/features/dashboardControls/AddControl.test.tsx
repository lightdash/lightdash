import { FilterOperator, type DashboardFilters } from '@lightdash/common';
import { MantineProvider } from '@mantine/core';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
import { AddControl } from './AddControl';

const mockSidebar = vi.hoisted(() => ({
    current: {
        isSidebarOpen: false,
        isViewer: false,
        canAddFilters: true,
        isNew: false,
        isPlaceholder: false,
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
const renderWithProviders = (ui: ReactElement) =>
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
                mockDashboardContext.current as DashboardEditTestValues,
            )}
        >
            {ui}
        </DashboardStoreTestProvider>,
    );

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
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

    it('lets viewers add filters from a checkbox that keeps the menu open', async () => {
        renderWithProviders(<AddControl />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Filter bar settings' }),
        );
        const item = await screen.findByRole('menuitem', {
            name: 'Viewers can add filters',
        });
        expect(screen.getByRole('checkbox')).toBeChecked();

        fireEvent.click(item);

        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
        expect(
            screen.getByRole('menuitem', { name: 'Viewers can add filters' }),
        ).toBeInTheDocument();
    });

    it('shows the box unchecked while viewers cannot add filters', async () => {
        mockDashboardContext.current.isAddFilterDisabled = true;
        renderWithProviders(<AddControl />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Filter bar settings' }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', {
                name: 'Viewers can add filters',
            }),
        );
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
            await userEvent.click(
                await screen.findByRole('menuitem', { name: /Filter rules/ }),
            );
            await userEvent.type(
                await screen.findByLabelText('Note for viewers'),
                'Pick a region',
            );

            await userEvent.click(settings());
            await userEvent.click(
                await screen.findByRole('menuitem', {
                    name: 'Viewers can add filters',
                    hidden: true,
                }),
            );

            expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);
            expect(note().value).toBe('Pick a region');

            await userEvent.click(
                screen.getByRole('menuitem', {
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
