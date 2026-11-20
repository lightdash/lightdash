import {
    DashboardControlRefKind,
    FilterOperator,
    type DashboardTile,
} from '@lightdash/common';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ComponentProps, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { dashboardParametersActions } from '../dashboard/store';
import { DashboardFiltersBar } from '../dashboardFilters/DashboardFiltersBar';
import type * as AddControlModule from './AddControl';
import { ControlsBar } from './ControlsBar';
import type * as DateZoomPillsModule from './DateZoomPills';

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
const mockEditor = vi.hoisted(() => ({
    current: { isEditorOpen: false, isMapping: false },
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

vi.mock('./useControlsEditor', () => ({
    useControlsEditorSelector: (
        selector: (value: typeof mockEditor.current) => unknown,
    ) => selector(mockEditor.current),
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
vi.mock('./ParameterPills', () => ({
    ParameterPills: () => <div data-testid="parameter-pills" />,
}));
// Reads the override the bar provides over the context, as the real one does: no capsules on a first load
vi.mock('./SectionedFilters', async () => {
    const { useContext } = await import('react');
    const { FilterFieldsOverrideContext } =
        await import('../../providers/Dashboard/filterFieldsOverride');
    return {
        SectionedFilters: () => {
            const override = useContext(FilterFieldsOverrideContext);
            const isFirstLoad = (override ?? mockDashboardContext.current)
                .isLoadingDashboardFilters;
            return (
                <div data-testid="sectioned-filters">
                    {!isFirstLoad && <div data-testid="capsules" />}
                </div>
            );
        },
    };
});

// The shipped date zoom on the right; without its controls, Default zoom alone
vi.mock('../dateZoom', () => ({
    DateZoom: ({ withControls = true }: { withControls?: boolean }) => (
        <div data-testid={withControls ? 'date-zoom' : 'default-zoom'} />
    ),
}));

// An editor's Default zoom opens its popover instead
vi.mock('./DateZoomPills', async (importOriginal) => ({
    ...(await importOriginal<typeof DateZoomPillsModule>()),
    DefaultZoomButton: () => <div data-testid="editor-default-zoom" />,
}));
vi.mock('../dateZoom/components/DateZoomCrossTabFieldsLoader', () => ({
    DateZoomCrossTabFieldsLoader: () => null,
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
            mockEditor.current = { isEditorOpen: true, isMapping: true };
            renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

            expect(screen.getByTestId('mapping-row')).toBeInTheDocument();
            // Kept mounted so it comes back at once, but out of reach
            const filterRow = screen
                .getByTestId('sectioned-filters')
                .closest('[data-hidden]');
            expect(filterRow).toHaveAttribute('inert');
        });

        it('brings the filter row back as it was once mapping ends', () => {
            mockEditor.current = { isEditorOpen: true, isMapping: true };
            const { rerender } = renderWithProviders(
                <ControlsBar {...baseProps} isEditMode />,
            );

            mockEditor.current = { isEditorOpen: true, isMapping: false };
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
        mockEditor.current = { isEditorOpen: false, isMapping: false };
        mockDashboardContext.current = {
            isAddFilterDisabled: false,
            setIsDateZoomDisabled: vi.fn(),
        };
    });

    it('renders Add and the pills in view mode, with Default zoom on the right and Hide, without Required or group markers', async () => {
        const onCollapse = vi.fn();
        renderWithProviders(
            <ControlsBar {...baseProps} onCollapse={onCollapse} />,
        );

        expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        // Named zooms are pills among the controls; Default zoom stays on the right
        expect(screen.queryByTestId('date-zoom')).not.toBeInTheDocument();
        expect(screen.getByTestId('default-zoom')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Hide' }));
        expect(onCollapse).toHaveBeenCalledTimes(1);
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
        expect(screen.queryByTestId('date-zoom')).not.toBeInTheDocument();
    });

    it('renders the sectioned filters in view mode for a stored order with no sections, the flat bar for none', () => {
        const ordered = createDashboardTestStore();
        seedDashboardEditState(ordered, {
            dashboard: {
                config: {
                    isDateZoomDisabled: false,
                    controlOrder: [
                        { kind: DashboardControlRefKind.FILTER, id: 'f' },
                    ],
                },
            },
        });
        const { unmount } = renderWithAppProviders(
            <DashboardStoreTestProvider store={ordered}>
                <ControlsBar {...baseProps} />
            </DashboardStoreTestProvider>,
        );
        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
        expect(
            screen.getByTestId('sectioned-filters').parentElement,
        ).toHaveStyle('--group-align: flex-start');
        unmount();

        // An empty order is none: the flat bar, as without the flag's order
        const empty = createDashboardTestStore();
        seedDashboardEditState(empty, {
            dashboard: {
                config: { isDateZoomDisabled: false, controlOrder: [] },
            },
        });
        renderWithAppProviders(
            <DashboardStoreTestProvider store={empty}>
                <ControlsBar {...baseProps} />
            </DashboardStoreTestProvider>,
        );
        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(
            screen.queryByTestId('sectioned-filters'),
        ).not.toBeInTheDocument();
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
        // The eye is the "..." menu's "Hide date zoom for viewers"
        expect(
            screen.queryByRole('button', {
                name: 'Toggle date zoom visibility for viewers',
            }),
        ).not.toBeInTheDocument();
        // An editor's Default zoom opens its popover, not the shipped menu
        expect(screen.getByTestId('editor-default-zoom')).toBeInTheDocument();
        expect(screen.queryByTestId('default-zoom')).toBeNull();
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
            expect(screen.queryByRole('note')).toBeNull();
        },
    );

    it('keeps the bar while a filter is edited', () => {
        mockEditor.current = { isEditorOpen: true, isMapping: false };
        renderWithProviders(<ControlsBar {...baseProps} isEditMode />);

        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
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

    it('drops the shipped parameter group: parameters are pills after the filters', () => {
        const store = createDashboardTestStore();
        store.dispatch(
            dashboardParametersActions.syncParameterControls({
                controls: [],
                isSaved: true,
            }),
        );
        renderWithProviders(
            <DashboardStoreTestProvider store={store}>
                <ControlsBar
                    {...baseProps}
                    parameters={{
                        region: { label: 'Region', options: ['EMEA'] },
                    }}
                />
            </DashboardStoreTestProvider>,
        );

        expect(screen.queryByTestId('parameters')).not.toBeInTheDocument();
        expect(
            screen
                .getByTestId('filter-pills')
                .nextElementSibling?.getAttribute('data-testid'),
        ).toBe('parameter-pills');
    });

    it.each([false, true])(
        'renders no legacy parameters while controls are not built (edit mode: %s)',
        (isEditMode) => {
            renderWithProviders(
                <ControlsBar
                    {...baseProps}
                    isEditMode={isEditMode}
                    parameters={{ region: { label: 'Region' } }}
                />,
            );
            expect(screen.queryByTestId('parameters')).not.toBeInTheDocument();
        },
    );

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
        mockEditor.current = { isEditorOpen: true, isMapping: false };
        renderWithProviders(<ControlsBar {...baseProps} />);

        expect(screen.getByTestId('filter-pills')).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Filters and parameters' }),
        ).not.toBeInTheDocument();
    });

    describe('on a dashboard whose tiles take no filters', () => {
        const markdownOnly = () => {
            const store = createDashboardTestStore();
            seedDashboardEditState(store, {
                dashboardTiles: [
                    {
                        uuid: 'tile-1',
                        type: 'markdown',
                        properties: {},
                    } as unknown as DashboardTile,
                ],
            });
            return store;
        };
        const noFilterTiles = {
            ...baseProps,
            hasTilesThatSupportFilters: false,
        };

        it.each([false, true])(
            'shows Default zoom on the right and no filters (edit mode %s), Add for an editor',
            (isEditMode) => {
                renderWithAppProviders(
                    <DashboardStoreTestProvider store={markdownOnly()}>
                        <ControlsBar
                            {...noFilterTiles}
                            isEditMode={isEditMode}
                        />
                    </DashboardStoreTestProvider>,
                );
                // A viewer's is the shipped menu; an editor's opens its popover
                expect(
                    screen.queryByTestId(
                        isEditMode ? 'editor-default-zoom' : 'default-zoom',
                    ),
                ).toBeInTheDocument();
                expect(
                    screen.queryByTestId(
                        isEditMode ? 'default-zoom' : 'editor-default-zoom',
                    ),
                ).toBeNull();
                expect(screen.queryByTestId('filter-pills')).toBeNull();
                expect(screen.queryByTestId('sectioned-filters')).toBeNull();
                expect(
                    screen.queryByRole('button', { name: 'Add' }) !== null,
                ).toBe(isEditMode);
            },
        );

        it('leaves the shipped bar as it is: date zoom on the right, no filters', () => {
            renderWithAppProviders(
                <DashboardStoreTestProvider store={markdownOnly()}>
                    <DashboardFiltersBar {...noFilterTiles} />
                </DashboardStoreTestProvider>,
            );
            expect(screen.getByTestId('date-zoom')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Add filter' }),
            ).toBeNull();
        });
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
        const bar = () => (
            <DashboardStoreTestProvider store={store}>
                <ControlsBar {...baseProps} isEditMode />
            </DashboardStoreTestProvider>
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
