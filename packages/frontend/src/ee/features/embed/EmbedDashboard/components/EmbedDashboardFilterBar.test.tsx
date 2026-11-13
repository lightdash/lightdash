import {
    DashboardControlRefKind,
    DateGranularity,
    DEFAULT_UI_STRINGS,
    FilterInteractivityValues,
    FilterOperator,
    type Dashboard,
    type DashboardTile,
    type InteractivityOptions,
} from '@lightdash/common';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dashboardParametersActions } from '../../../../../features/dashboard/store';
import { ControlContractClasses } from '../../../../../features/dashboardControls/controlContractClasses';
import {
    createDashboardTestStore,
    seedDashboardEditState,
} from '../../../../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../../../../testing/DashboardStoreTestProvider';
import { renderWithProviders } from '../../../../../testing/testUtils';
import EmbedDashboardFilterBar from './EmbedDashboardFilterBar';

const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
vi.mock('../../../../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector: (context: Record<string, unknown>) => unknown) =>
        selector(mockDashboardContext.current),
    ),
}));

vi.mock('../../../../../features/dashboardControls/AddControl', () => ({
    AddControl: ({
        triggerClassName,
        unsavedFiltersTooltip,
        withParameters = true,
        withDateZooms = true,
    }: {
        triggerClassName?: string;
        unsavedFiltersTooltip?: string;
        withParameters?: boolean;
        withDateZooms?: boolean;
    }) => (
        <button
            type="button"
            className={triggerClassName}
            data-tooltip={unsavedFiltersTooltip}
            data-with-parameters={String(withParameters)}
            data-with-date-zooms={String(withDateZooms)}
        >
            Controls add
        </button>
    ),
}));
// Reads the override the bar provides over the context, as the real pills do: skeletons on a first load
vi.mock('../../../../../features/dashboardControls/FilterPills', async () => {
    const { useContext } = await import('react');
    const { FilterFieldsOverrideContext } =
        await import('../../../../../providers/Dashboard/filterFieldsOverride');
    return {
        FilterPills: ({ triggerClassName }: { triggerClassName?: string }) => {
            const override = useContext(FilterFieldsOverrideContext);
            const isFirstLoad =
                (override ?? mockDashboardContext.current)
                    .isLoadingDashboardFilters === true;
            return (
                <div
                    data-testid="controls-pills"
                    className={triggerClassName}
                    data-skeletons={isFirstLoad || undefined}
                />
            );
        },
    };
});
vi.mock('../../../../../features/dashboardControls/SectionedFilters', () => ({
    SectionedFilters: ({
        viewerActions,
        editorActions,
        triggerClassName,
    }: {
        viewerActions?: ReactNode;
        editorActions?: ReactNode;
        triggerClassName?: string;
    }) => (
        <div
            data-testid="sectioned-filters"
            data-editor={editorActions !== undefined || undefined}
            className={triggerClassName}
        >
            {viewerActions}
            {editorActions}
        </div>
    ),
}));
// An editor's Default zoom has its own tests, and reads the date zoom editor
vi.mock(
    '../../../../../features/dashboardControls/DateZoomPills',
    async (importActual) => ({
        ...(await importActual<object>()),
        DefaultZoomButton: () => (
            <button type="button" data-testid="default-zoom-button" />
        ),
    }),
);
vi.mock(
    '../../../../../features/dateZoom/components/DateZoomCrossTabFieldsLoader',
    () => ({
        DateZoomCrossTabFieldsLoader: () => (
            <div data-testid="cross-tab-fields-loader" />
        ),
    }),
);
// Reads the controls provider, which the page puts around the bar
vi.mock('../../../../../features/dashboardControls/ControlsBar', () => ({
    MappingSwap: ({ children }: { children: ReactNode }) => (
        <div data-testid="mapping-swap">{children}</div>
    ),
}));
vi.mock(
    '../../../../../features/dashboardControls/useParameterBarControls',
    () => ({
        useParameterBarControls: () => ({
            entries: [{ control: { hidden: false } }],
        }),
    }),
);
// The controls state, which the page provides around the real date zoom pills
vi.mock('../../../../../features/dashboardControls/useControlsEditor', () => ({
    useControlsEditorSelector: (
        selector: (c: Record<string, unknown>) => unknown,
    ) =>
        selector({
            isMapping: false,
            isEditorOpen: false,
            isViewer: true,
            requestSwitch: (proceed: () => void) => proceed(),
        }),
}));
vi.mock('../../../../../features/dashboardControls/ParameterPills', () => ({
    ParameterPills: () => <div data-testid="parameter-pills" />,
}));
vi.mock('./EmbedDashboardParameters', () => ({
    default: () => <div data-testid="shipped-parameters" />,
}));
vi.mock('./EmbedDashboardFilters', () => ({
    default: () => <div data-testid="shipped-filters" />,
    EmbedResetFiltersButton: () => <button type="button">Reset</button>,
}));
vi.mock('../../../../../features/dateZoom', () => ({
    DateZoom: ({
        dropdownClassName,
        withControls = true,
    }: {
        dropdownClassName?: string;
        withControls?: boolean;
    }) => (
        <div
            data-testid="shipped-date-zoom"
            data-with-controls={String(withControls)}
            className={dropdownClassName}
        />
    ),
}));

const dashboard = (canAddFilters: boolean, areParametersEnabled = false) =>
    ({
        uuid: 'dashboard-1',
        canDateZoom: false,
        dashboardFiltersInteractivity: {
            enabled: FilterInteractivityValues.all,
            canAddFilters,
        },
        parameterInteractivity: { enabled: areParametersEnabled },
    }) as unknown as Dashboard & InteractivityOptions;

const savedRule = {
    id: 'saved',
    label: undefined,
    operator: FilterOperator.EQUALS,
    target: { fieldId: 'orders_status', tableName: 'orders' },
    values: ['done'],
};

const sectionedStore = () => {
    const store = createDashboardTestStore({
        dashboardFilters: {
            dimensions: [{ ...savedRule, sectionId: 'a' }],
            metrics: [],
            tableCalculations: [],
        },
    });
    seedDashboardEditState(store, {
        dashboard: {
            config: {
                isDateZoomDisabled: false,
                controlSections: [{ id: 'a', name: 'Dates' }],
            },
        },
    });
    return store;
};

const barElement = (
    canAddFilters: boolean,
    isControlsEnabled: boolean,
    store = createDashboardTestStore({
        dashboardFilters: {
            dimensions: [savedRule],
            metrics: [],
            tableCalculations: [],
        },
    }),
): ReactElement => (
    // One saved filter, so the bar has something to show
    <DashboardStoreTestProvider store={store}>
        <EmbedDashboardFilterBar
            dashboard={dashboard(canAddFilters)}
            shouldShowFilters
            activeTiles={[]}
            isControlsEnabled={isControlsEnabled}
        />
    </DashboardStoreTestProvider>
);

const renderBar = (canAddFilters: boolean, isControlsEnabled: boolean) =>
    renderWithProviders(barElement(canAddFilters, isControlsEnabled));

describe('EmbedDashboardFilterBar', () => {
    beforeEach(() => {
        mockDashboardContext.current = {};
    });

    it('keeps the shipped filters while the controls bar is off', () => {
        renderBar(true, false);
        expect(screen.getByTestId('shipped-filters')).toBeInTheDocument();
        expect(screen.queryByTestId('controls-pills')).not.toBeInTheDocument();
        expect(screen.queryByTestId('mapping-swap')).not.toBeInTheDocument();
    });

    it("gives the controls bar the mapping row's place, so a viewer can choose tiles", () => {
        renderBar(true, true);
        expect(
            within(screen.getByTestId('mapping-swap')).getByTestId(
                'controls-pills',
            ),
        ).toBeInTheDocument();
    });

    it('opens the editor from "Add filter" and the pills, with the class contract', () => {
        renderBar(true, true);
        expect(screen.queryByTestId('shipped-filters')).not.toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Controls add' }),
        ).toHaveClass('ld-dashboard-add-filter');
        expect(
            screen.getByRole('button', { name: 'Controls add' }),
        ).toHaveAttribute(
            'data-tooltip',
            DEFAULT_UI_STRINGS['filters.unsavedFiltersTooltip'],
        );
        expect(screen.getByTestId('controls-pills')).toHaveClass(
            'ld-dashboard-filter',
        );
        expect(
            screen.queryByRole('button', { name: 'Reset' }),
        ).not.toBeInTheDocument();
    });

    it('offers only the reset where viewers may not add filters', () => {
        renderBar(false, true);
        expect(
            screen.getByRole('button', { name: 'Reset' }),
        ).toBeInTheDocument();
    });

    it("shows a dashboard's sections as the app's viewer bar, with the class contract", () => {
        renderWithProviders(barElement(false, true, sectionedStore()));
        const sectioned = screen.getByTestId('sectioned-filters');
        expect(sectioned).toHaveClass('ld-dashboard-filter');
        // "Add filter" and the reset lead the sectioned bar
        expect(
            within(sectioned).getByRole('button', { name: 'Controls add' }),
        ).toHaveClass('ld-dashboard-add-filter');
        expect(
            within(sectioned).getByRole('button', { name: 'Reset' }),
        ).toBeInTheDocument();
        expect(screen.queryByTestId('controls-pills')).not.toBeInTheDocument();
        // A size container, for the bar's narrow layouts
        expect(sectioned.closest('[class*="filterArea"]')).not.toBeNull();
    });

    it("shows a stored order with no sections as the app's viewer bar", () => {
        const store = createDashboardTestStore({
            dashboardFilters: {
                dimensions: [savedRule],
                metrics: [],
                tableCalculations: [],
            },
        });
        seedDashboardEditState(store, {
            dashboard: {
                config: {
                    isDateZoomDisabled: false,
                    controlOrder: [
                        { kind: DashboardControlRefKind.FILTER, id: 'saved' },
                    ],
                },
            },
        });
        renderWithProviders(barElement(false, true, store));
        expect(screen.getByTestId('sectioned-filters')).toBeInTheDocument();
        expect(screen.queryByTestId('controls-pills')).not.toBeInTheDocument();
    });

    it('keeps the shipped filters for a dashboard with sections while the flag is off', () => {
        renderWithProviders(barElement(true, false, sectionedStore()));
        expect(screen.getByTestId('shipped-filters')).toBeInTheDocument();
        expect(
            screen
                .getByTestId('shipped-filters')
                .closest('[class*="filterArea"]'),
        ).toBeNull();
        expect(
            screen.queryByTestId('sectioned-filters'),
        ).not.toBeInTheDocument();
    });

    describe("an editor's bar", () => {
        const renderEditor = ({
            canDateZoom,
            areParametersEnabled,
            isControlsEnabled = true,
        }: {
            canDateZoom: boolean;
            areParametersEnabled: boolean;
            isControlsEnabled?: boolean;
        }) => {
            // A flat dashboard: no sections, no stored order
            const store = createDashboardTestStore({
                dashboardFilters: {
                    dimensions: [savedRule],
                    metrics: [],
                    tableCalculations: [],
                },
            });
            store.dispatch(
                dashboardParametersActions.syncParameterControls({
                    controls: [],
                    isSaved: true,
                }),
            );
            return renderWithProviders(
                <DashboardStoreTestProvider store={store}>
                    <EmbedDashboardFilterBar
                        dashboard={{
                            // Viewers may not add filters; an editor always can
                            ...dashboard(false, areParametersEnabled),
                            canDateZoom,
                        }}
                        shouldShowFilters
                        activeTiles={[]}
                        isEditMode
                        isControlsEnabled={isControlsEnabled}
                    />
                </DashboardStoreTestProvider>,
            );
        };

        it("is the app's sectioned editor bar, with the class contract", () => {
            renderEditor({ canDateZoom: false, areParametersEnabled: false });
            const sectioned = screen.getByTestId('sectioned-filters');
            expect(sectioned).toHaveAttribute('data-editor', 'true');
            expect(sectioned).toHaveClass('ld-dashboard-filter');
            expect(
                within(sectioned).getByRole('button', { name: 'Controls add' }),
            ).toHaveClass('ld-dashboard-add-filter');
            expect(
                within(screen.getByTestId('mapping-swap')).getByTestId(
                    'sectioned-filters',
                ),
            ).toBeInTheDocument();
            expect(
                screen.queryByTestId('shipped-filters'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Reset' }),
            ).not.toBeInTheDocument();
        });

        it.each([
            { canDateZoom: false, areParametersEnabled: false },
            { canDateZoom: true, areParametersEnabled: false },
            { canDateZoom: false, areParametersEnabled: true },
        ])(
            'adds only the kinds the token shows (%o)',
            ({ canDateZoom, areParametersEnabled }) => {
                renderEditor({ canDateZoom, areParametersEnabled });
                const add = screen.getByRole('button', {
                    name: 'Controls add',
                });
                expect(add).toHaveAttribute(
                    'data-with-date-zooms',
                    String(canDateZoom),
                );
                expect(add).toHaveAttribute(
                    'data-with-parameters',
                    String(areParametersEnabled),
                );
            },
        );

        it("has the editor's Default zoom in the shipped one's place", () => {
            renderEditor({ canDateZoom: true, areParametersEnabled: false });
            expect(
                screen.getByTestId('default-zoom-button').parentElement,
            ).toHaveClass('ld-dashboard-date-zoom');
            expect(
                screen.getByTestId('cross-tab-fields-loader'),
            ).toBeInTheDocument();
            expect(
                screen.queryByTestId('shipped-date-zoom'),
            ).not.toBeInTheDocument();
        });

        it('has no Default zoom where the token allows no date zoom', () => {
            renderEditor({ canDateZoom: false, areParametersEnabled: false });
            expect(
                screen.queryByTestId('default-zoom-button'),
            ).not.toBeInTheDocument();
        });

        it('keeps the shipped editor and date zoom with the controls off', () => {
            renderEditor({
                canDateZoom: true,
                areParametersEnabled: false,
                isControlsEnabled: false,
            });
            expect(screen.getByTestId('shipped-filters')).toBeInTheDocument();
            expect(screen.getByTestId('shipped-date-zoom')).toHaveAttribute(
                'data-with-controls',
                'true',
            );
            expect(
                screen.queryByTestId('sectioned-filters'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByTestId('default-zoom-button'),
            ).not.toBeInTheDocument();
        });
    });

    describe('parameters', () => {
        const renderParameters = ({
            isControlsEnabled,
            areParametersEnabled,
            shouldShowFilters,
            hasControls = true,
        }: {
            isControlsEnabled: boolean;
            areParametersEnabled: boolean;
            shouldShowFilters: boolean;
            hasControls?: boolean;
        }) => {
            const store = createDashboardTestStore({
                parameterDefinitions: { region: { label: 'Region' } },
                tileParameterReferences: { 'tile-1': ['region'] },
            });
            if (hasControls)
                store.dispatch(
                    dashboardParametersActions.syncParameterControls({
                        controls: [],
                        isSaved: true,
                    }),
                );
            return renderWithProviders(
                <DashboardStoreTestProvider store={store}>
                    <EmbedDashboardFilterBar
                        dashboard={dashboard(true, areParametersEnabled)}
                        shouldShowFilters={shouldShowFilters}
                        activeTiles={[{ uuid: 'tile-1' } as DashboardTile]}
                        isControlsEnabled={isControlsEnabled}
                    />
                </DashboardStoreTestProvider>,
            );
        };

        it.each([true, false])(
            'renders no parameters while the list is not built (filters shown: %s)',
            (shouldShowFilters) => {
                renderParameters({
                    isControlsEnabled: true,
                    areParametersEnabled: true,
                    shouldShowFilters,
                    hasControls: false,
                });
                expect(
                    screen.queryByTestId('shipped-parameters'),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByTestId('parameter-pills'),
                ).not.toBeInTheDocument();
            },
        );

        it('renders parameter pills after the filters with the controls on', () => {
            renderParameters({
                isControlsEnabled: true,
                areParametersEnabled: true,
                shouldShowFilters: true,
            });
            expect(
                screen.getByTestId('controls-pills').nextElementSibling,
            ).toBe(screen.getByTestId('parameter-pills'));
            expect(
                screen.queryByTestId('shipped-parameters'),
            ).not.toBeInTheDocument();
        });

        it('keeps the parameters group class when filters are hidden', () => {
            renderParameters({
                isControlsEnabled: true,
                areParametersEnabled: true,
                shouldShowFilters: false,
            });
            expect(
                screen.getByTestId('parameter-pills').parentElement,
            ).toHaveClass('ld-dashboard-parameters');
        });

        it('hides parameter pills without parameter interactivity', () => {
            renderParameters({
                isControlsEnabled: true,
                areParametersEnabled: false,
                shouldShowFilters: true,
            });
            expect(
                screen.queryByTestId('parameter-pills'),
            ).not.toBeInTheDocument();
        });

        it('keeps the shipped parameters with the controls off', () => {
            renderParameters({
                isControlsEnabled: false,
                areParametersEnabled: true,
                shouldShowFilters: true,
            });
            expect(
                screen.getByTestId('shipped-parameters'),
            ).toBeInTheDocument();
            expect(
                screen.queryByTestId('parameter-pills'),
            ).not.toBeInTheDocument();
        });
    });

    describe('date zoom', () => {
        const zoomStore = (hidden = false) => {
            // The saved config, as the page's context has it
            mockDashboardContext.current = {
                dashboard: {
                    config: {
                        isDateZoomDisabled: false,
                        dateZoomConfig: {
                            controls: [
                                {
                                    uuid: 'z1',
                                    name: 'Revenue zoom',
                                    granularity: DateGranularity.WEEK,
                                    hidden,
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
                },
            };
            const store = createDashboardTestStore({
                chartZoomableFieldsByTileUuid: {
                    'tile-1': [
                        {
                            fieldId: 'orders_date',
                            label: 'Order date',
                            tableName: 'orders',
                        },
                    ],
                    'tile-2': [
                        {
                            fieldId: 'orders_date',
                            label: 'Order date',
                            tableName: 'orders',
                        },
                    ],
                },
            });
            seedDashboardEditState(store, {
                dashboardTiles: ['tile-1', 'tile-2'].map(
                    (uuid) =>
                        ({
                            uuid,
                            type: 'saved_chart',
                            properties: {},
                        }) as DashboardTile,
                ),
            });
            return store;
        };
        const renderZoom = ({
            isControlsEnabled,
            shouldShowFilters = true,
            isEditMode = false,
            hidden = false,
        }: {
            isControlsEnabled: boolean;
            shouldShowFilters?: boolean;
            isEditMode?: boolean;
            hidden?: boolean;
        }) =>
            renderWithProviders(
                <DashboardStoreTestProvider store={zoomStore(hidden)}>
                    {/* As the embed page provides them */}
                    <ControlContractClasses.Provider
                        value={{
                            editor: 'ld-dashboard-control-editor',
                            addFilterDropdown:
                                'ld-dashboard-add-filter-dropdown',
                            filterDropdown: 'ld-dashboard-filter-dropdown',
                            parameter: 'ld-dashboard-parameter',
                            parameterDropdown:
                                'ld-dashboard-parameter-dropdown',
                            dateZoom: 'ld-dashboard-date-zoom',
                            dateZoomDropdown: 'ld-dashboard-date-zoom-dropdown',
                        }}
                    >
                        <EmbedDashboardFilterBar
                            dashboard={{
                                ...dashboard(true),
                                canDateZoom: true,
                            }}
                            shouldShowFilters={shouldShowFilters}
                            activeTiles={[]}
                            isEditMode={isEditMode}
                            isControlsEnabled={isControlsEnabled}
                        />
                    </ControlContractClasses.Provider>
                </DashboardStoreTestProvider>,
            );
        const zoomPill = (name: string) =>
            screen.getByRole('button', { name: new RegExp(`^${name} is`) });

        it.each([true, false])(
            'renders date zoom pills in the flow and the shipped Default zoom alone on the right (filters shown: %s)',
            (shouldShowFilters) => {
                renderZoom({ isControlsEnabled: true, shouldShowFilters });
                expect(zoomPill('Revenue zoom')).toHaveClass(
                    'ld-dashboard-date-zoom',
                );
                const shipped = screen.getByTestId('shipped-date-zoom');
                expect(shipped).toHaveAttribute('data-with-controls', 'false');
                expect(shipped).toHaveClass('ld-dashboard-date-zoom-dropdown');
                expect(shipped.parentElement).toHaveClass(
                    'ld-dashboard-date-zoom',
                );
            },
        );

        it('hides the bar behind the shipped Hide and summary with the controls on', async () => {
            const user = userEvent.setup();
            renderBar(true, true);
            await user.click(screen.getByRole('button', { name: 'Hide' }));
            expect(
                screen.queryByTestId('controls-pills'),
            ).not.toBeInTheDocument();
            await user.click(
                screen.getByRole('button', { name: 'Show filters' }),
            );
            expect(screen.getByTestId('controls-pills')).toBeInTheDocument();
        });

        it('collapses named zooms alone behind Hide, counted in the summary', async () => {
            const user = userEvent.setup();
            renderZoom({ isControlsEnabled: true });
            await user.click(screen.getByRole('button', { name: 'Hide' }));
            expect(
                screen.queryByRole('button', { name: /^Revenue zoom is/ }),
            ).not.toBeInTheDocument();
            expect(screen.getByText(/date zoom/)).toHaveTextContent(
                /^1 date zoom · Date Zoom:/,
            );
            await user.click(
                screen.getByRole('button', { name: 'Show filters' }),
            );
            expect(zoomPill('Revenue zoom')).toBeInTheDocument();
        });

        it.each([
            [
                'a zoom hidden from viewers',
                { isControlsEnabled: true, hidden: true },
            ],
            ['the controls are off', { isControlsEnabled: false }],
        ])('offers no Hide for a named zoom alone when %s', (_, props) => {
            renderZoom(props);
            expect(
                screen.queryByRole('button', { name: 'Hide' }),
            ).not.toBeInTheDocument();
        });

        it.each([
            ['the controls are off', { isControlsEnabled: false }],
            [
                'an editor is in edit mode',
                { isControlsEnabled: false, isEditMode: true },
            ],
        ])('keeps the shipped date zoom group when %s', (_, props) => {
            renderZoom(props);
            const shipped = screen.getByTestId('shipped-date-zoom');
            expect(shipped).toHaveAttribute('data-with-controls', 'true');
            expect(shipped).toHaveClass('ld-dashboard-date-zoom-dropdown');
            expect(shipped.parentElement).toHaveClass('ld-dashboard-date-zoom');
            expect(
                screen.queryByRole('button', { name: /^Default zoom is/ }),
            ).not.toBeInTheDocument();
        });
    });

    it('keeps the pills while a tile change reloads the filter fields', () => {
        const loaded = {
            isLoadingDashboardFilters: false,
            isFetchingDashboardFilters: false,
            filterableFieldsByTileUuid: { 'tile-1': [] },
            allFilterableFields: [],
        };
        mockDashboardContext.current = loaded;
        const { rerender } = renderBar(true, true);
        expect(screen.getByTestId('controls-pills')).not.toHaveAttribute(
            'data-skeletons',
        );

        // A tile added or removed is a new query key: a first load again
        mockDashboardContext.current = {
            ...loaded,
            isLoadingDashboardFilters: true,
            isFetchingDashboardFilters: true,
            filterableFieldsByTileUuid: undefined,
            allFilterableFields: undefined,
        };
        rerender(barElement(true, true));
        expect(screen.getByTestId('controls-pills')).not.toHaveAttribute(
            'data-skeletons',
        );
    });
});
