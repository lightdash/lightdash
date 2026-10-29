import { FilterOperator } from '@lightdash/common';
import { screen } from '@testing-library/react';
import { type ComponentProps, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardContext from '../../providers/Dashboard/context';
import { type DashboardContextType } from '../../providers/Dashboard/types';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import type * as AddControlModule from './AddControl';
import { ControlsBar } from './ControlsBar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
// Empty saved and temporary filters, so the combined filters are empty too
const renderWithProviders = (ui: ReactElement) =>
    renderWithAppProviders(
        <DashboardStoreTestProvider store={createDashboardTestStore()}>
            {ui}
        </DashboardStoreTestProvider>,
    );
const mockCompact = vi.hoisted(() => ({ current: false }));
const mockSidebar = vi.hoisted(() => ({
    current: { isSidebarOpen: false, isMapping: false },
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

vi.mock('../../components/common/Page/useCompactContentHeader', () => ({
    useCompactContentHeader: vi.fn(() => mockCompact.current),
}));

// Children are shipped components with their own tests; stub them to pin the bar's composition
vi.mock('../dashboardFilters', () => ({
    default: ({ isEditMode }: { isEditMode: boolean }) => (
        <button data-edit-mode={isEditMode}>Add filter</button>
    ),
}));

vi.mock(
    '../dashboardFilters/FilterRequirements/FilterRequirementsButton',
    () => ({ default: () => <button>Required</button> }),
);

vi.mock('../parameters', () => ({
    Parameters: ({ parameters }: { parameters: Record<string, unknown> }) => (
        <div data-testid="parameters">{Object.keys(parameters).join(',')}</div>
    ),
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebarSelector: (
        selector: (value: typeof mockSidebar.current) => unknown,
    ) => selector(mockSidebar.current),
}));

vi.mock('./AddControl', async (importOriginal) => ({
    ...(await importOriginal<typeof AddControlModule>()),
    AddControl: () => <button>Add</button>,
}));
vi.mock('./MappingRow', () => ({
    MappingRow: () => <div data-testid="mapping-row" />,
}));
vi.mock('./FilterPills', () => ({
    FilterPills: () => <div data-testid="filter-pills" />,
}));
// Reads the context the bar provides, as the real one does: no capsules on a first load
vi.mock('./SectionedFilters', async () => {
    const { useContextSelector } = await import('use-context-selector');
    const { default: DashboardContext } =
        await import('../../providers/Dashboard/context');
    return {
        SectionedFilters: () => {
            const isFirstLoad = useContextSelector(
                DashboardContext,
                (c) => c?.isLoadingDashboardFilters,
            );
            return (
                <div data-testid="sectioned-filters">
                    {!isFirstLoad && <div data-testid="capsules" />}
                </div>
            );
        },
    };
});

vi.mock('../dateZoom', () => ({
    DateZoom: () => <div data-testid="date-zoom" />,
}));

const baseProps: ComponentProps<typeof ControlsBar> = {
    isEditMode: false,
    activeTabUuid: undefined,
    hasTilesThatSupportFilters: true,
    hasDashboardTiles: true,
    parameters: {},
    shadowedReservedNames: [],
    parameterValues: {},
    onParameterChange: vi.fn(),
    onParameterClearAll: vi.fn(),
    isParameterLoading: false,
    missingRequiredParameters: [],
    pinnedParameters: [],
    onParameterPin: vi.fn(),
    parameterOrder: [],
    onParameterReorder: vi.fn(),
    isDateZoomDisabled: false,
    onCollapse: vi.fn(),
};

describe('ControlsBar', () => {
    describe('while tiles are chosen', () => {
        beforeEach(() => {
            mockCompact.current = false;
            mockDashboardContext.current = {
                isAddFilterDisabled: false,
                setIsDateZoomDisabled: vi.fn(),
            };
        });

        it('shows the mapping row over the filter row, which is faded and inert', () => {
            mockSidebar.current = { isSidebarOpen: true, isMapping: true };
            renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

            expect(screen.getByTestId('mapping-row')).toBeInTheDocument();
            // Kept in place so the grid does not move, but out of reach
            const filterRow = screen
                .getByTestId('sectioned-filters')
                .closest('[data-hidden]');
            expect(filterRow).toHaveAttribute('inert');
        });

        it('brings the filter row back as it was once mapping ends', () => {
            mockSidebar.current = { isSidebarOpen: true, isMapping: true };
            const { rerender } = renderWithProviders(
                <ControlsBar {...baseProps} isEditMode />,
            );

            mockSidebar.current = { isSidebarOpen: true, isMapping: false };
            rerender(
                <DashboardStoreTestProvider store={createDashboardTestStore()}>
                    <ControlsBar {...baseProps} isEditMode />
                </DashboardStoreTestProvider>,
            );
            expect(screen.queryByTestId('mapping-row')).not.toBeInTheDocument();
            expect(
                screen.getByTestId('sectioned-filters').closest('[inert]'),
            ).toBeNull();
        });
    });

    beforeEach(() => {
        mockCompact.current = false;
        mockSidebar.current = { isSidebarOpen: false, isMapping: false };
        mockDashboardContext.current = {
            isAddFilterDisabled: false,
            setIsDateZoomDisabled: vi.fn(),
        };
    });

    it('renders Add and the pills in view mode, with date zoom and hide, without Required', () => {
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('date-zoom')).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Hide' }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Required' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId('parameters')).not.toBeInTheDocument();
        expect(
            screen.queryByTestId('sectioned-filters'),
        ).not.toBeInTheDocument();
    });

    it("centres the flat view bar's items on each line, the funnel's centre; the sectioned flow centres its own", () => {
        const { unmount } = renderWithProviders(<ControlsBar {...baseProps} />);
        expect(screen.getByTestId('filter-pills').parentElement).toHaveStyle(
            '--group-align: center',
        );
        unmount();

        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);
        expect(
            screen.getByTestId('sectioned-filters').parentElement,
        ).toHaveStyle('--group-align: flex-start');
    });

    it('renders the sectioned filters in view mode once the dashboard has sections', () => {
        const store = createDashboardTestStore();
        seedDashboardEditState(store, {
            dashboard: {
                config: {
                    isDateZoomDisabled: false,
                    controlSections: [{ id: 'a', name: 'Dates' }],
                },
            },
        });
        renderWithAppProviders(
            <DashboardStoreTestProvider store={store}>
                <ControlsBar {...baseProps} />
            </DashboardStoreTestProvider>,
        );

        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('date-zoom')).toBeInTheDocument();
    });

    it('renders the sections in edit mode when the dashboard has sections, with no Required button', () => {
        const store = createDashboardTestStore();
        seedDashboardEditState(store, {
            dashboard: {
                config: {
                    isDateZoomDisabled: false,
                    controlSections: [{ id: 'a', name: 'Dates' }],
                },
            },
        });
        renderWithAppProviders(
            <DashboardStoreTestProvider store={store}>
                <ControlsBar {...baseProps} isEditMode />
            </DashboardStoreTestProvider>,
        );

        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
        // Filter rules open from the menu on "Add filter"
        expect(
            screen.queryByRole('button', { name: 'Required' }),
        ).not.toBeInTheDocument();
    });

    it('renders the sectioned bar in edit mode with no sections yet, so a selection can start the first', () => {
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Required' }),
        ).not.toBeInTheDocument();
        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Toggle date zoom visibility for viewers',
            }),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Hide' }),
        ).not.toBeInTheDocument();
    });

    it.each([true, false])(
        'shows no tip line above the bar (%s)',
        (isEditMode) => {
            const rule = (id: string) => ({
                id,
                label: undefined,
                operator: FilterOperator.EQUALS,
                target: { fieldId: id, tableName: 'orders' },
            });
            renderWithAppProviders(
                <DashboardStoreTestProvider
                    store={createDashboardTestStore({
                        dashboardFilters: {
                            dimensions: [rule('a'), rule('b')],
                            metrics: [],
                            tableCalculations: [],
                        },
                    })}
                >
                    <ControlsBar {...baseProps} isEditMode={isEditMode} />
                </DashboardStoreTestProvider>,
            );
            expect(screen.getByTestId('date-zoom')).toBeInTheDocument();
            expect(screen.queryByRole('note')).toBeNull();
        },
    );

    it('keeps the bar while a filter is edited', () => {
        mockSidebar.current = { isSidebarOpen: true, isMapping: false };
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
        expect(screen.getByTestId('date-zoom')).toBeInTheDocument();
    });

    it('keeps the walkthrough anchors of the shipped bar in edit mode', () => {
        const { container } = renderWithProviders(
            <ControlsBar {...baseProps} isEditMode />,
        );

        // No attribute values here: the walkthrough scanner reads them as steps
        expect(
            container.querySelector('[data-tour-scope][data-tour-look]'),
        ).toContainElement(screen.getByTestId('sectioned-filters'));
    });

    it('leaves the shipped bar as it is when it is given no filter area', () => {
        renderWithProviders(<DashboardFiltersBar {...baseProps} isEditMode />);

        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toHaveAttribute('data-edit-mode', 'true');
        expect(
            screen.getByRole('button', { name: 'Required' }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('filter-pills')).not.toBeInTheDocument();
    });

    it('renders the shipped parameters only when the tab has parameters', () => {
        renderWithProviders(
            <ControlsBar
                {...baseProps}
                parameters={{
                    region: { label: 'Region', options: ['EMEA'] },
                }}
            />,
        );

        expect(screen.getByTestId('parameters')).toHaveTextContent('region');
    });

    it('collapses into a drawer trigger on compact viewports in view mode', () => {
        mockCompact.current = true;
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', {
                name: 'Filters and parameters',
                expanded: false,
            }),
        ).toBeInTheDocument();
    });

    it('shows the bar in place on compact viewports while a filter is edited', () => {
        mockCompact.current = true;
        mockSidebar.current = { isSidebarOpen: true, isMapping: false };
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Filters and parameters' }),
        ).not.toBeInTheDocument();
    });

    it('keeps the capsules while a tile change reloads the filter fields', () => {
        const loaded = {
            ...mockDashboardContext.current,
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            filterableFieldsByTileUuid: { 'tile-1': [] },
            allFilterableFields: [],
        };
        mockDashboardContext.current = loaded;
        const store = createDashboardTestStore();
        // The page's provider, which the bar's filter area reads below it
        const bar = () => (
            <DashboardContext.Provider
                value={
                    mockDashboardContext.current as unknown as DashboardContextType
                }
            >
                <DashboardStoreTestProvider store={store}>
                    <ControlsBar {...baseProps} isEditMode />
                </DashboardStoreTestProvider>
            </DashboardContext.Provider>
        );
        const { rerender } = renderWithAppProviders(bar());
        expect(screen.getByTestId('capsules')).toBeInTheDocument();

        // A tile added or removed is a new query key: a first load again
        mockDashboardContext.current = {
            ...loaded,
            isLoadingDashboardFilters: true,
            isFetchingDashboardFilters: true,
            filterableFieldsByTileUuid: undefined,
            allFilterableFields: undefined,
        };
        rerender(bar());
        expect(screen.getByTestId('capsules')).toBeInTheDocument();
    });
});
