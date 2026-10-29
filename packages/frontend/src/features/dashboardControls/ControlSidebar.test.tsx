import {
    DashboardTileTypes,
    type DashboardFilters,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { ControlSidebar } from './ControlSidebar';
import { RailContractClasses } from './railContractClasses';
import { type ControlsSidebarContextValue } from './useControlsSidebar';
import { LABEL_COMMIT_DELAY } from './useLabelDraft';

const mockSidebar = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));
const mockDashboardContext = vi.hoisted(() => ({
    current: {} as Record<string, unknown>,
}));

vi.mock('./useControlsSidebar', () => ({
    useControlsSidebar: vi.fn(() => mockSidebar.current),
    useControlsSidebarSelector: (
        selector: (value: Record<string, unknown>) => unknown,
    ) => selector(mockSidebar.current),
}));

vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: vi.fn((selector) => selector(mockDashboardContext.current)),
}));

const mockSqlColumnsByTile = vi.hoisted(() => ({}));
vi.mock('./useSqlColumnsByTile', () => ({
    useSqlColumnsByTile: () => mockSqlColumnsByTile,
}));

vi.mock('./FieldsAndTiles', () => ({
    // The placeholder's field search sits in `data-controls-start`
    FieldsAndTiles: () => (
        <div data-testid="fields-and-tiles" data-controls-start>
            <input aria-label="Search fields" />
        </div>
    ),
}));

vi.mock('./FilterSettings', () => ({
    FilterSettings: ({
        field,
        sectionSelect,
        tilesSummary,
    }: {
        field: { label: string } | null;
        sectionSelect: ReactNode;
        tilesSummary: string;
    }) => (
        <div data-testid="filter-settings">
            <div data-controls-value>
                <input aria-label="Operator" />
            </div>
            {field ? `Settings for ${field.label}` : 'Settings with no field'}
            {sectionSelect}
            <span data-testid="tiles-summary">{tilesSummary}</span>
        </div>
    ),
}));

const FIELD_ID = 'orders_status';

const field = {
    fieldType: 'dimension',
    type: 'string',
    name: 'status',
    label: 'Status',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.status',
    hidden: false,
};

const REGION = { fieldId: 'orders_region', tableName: 'orders' };

const tile = (uuid: string, tabUuid: string | undefined) =>
    ({ uuid, tabUuid, type: DashboardTileTypes.SAVED_CHART }) as DashboardTile;

const tab = (uuid: string, order: number) =>
    ({ uuid, name: uuid, order }) as DashboardTab;

const makeRule = (
    overrides: Partial<DashboardFilterRule>,
): DashboardFilterRule => ({
    id: 'filter-1',
    operator: 'equals' as DashboardFilterRule['operator'],
    target: { fieldId: FIELD_ID, tableName: 'orders' },
    values: ['done'],
    label: undefined,
    ...overrides,
});

const setSidebar = (overrides: Partial<ControlsSidebarContextValue>) => {
    const value: ControlsSidebarContextValue = {
        editing: { filterId: 'filter-1' },
        isViewer: false,
        canAddFilters: true,
        isNew: true,
        isPlaceholder: false,
        editingRule: makeRule({}),
        isSidebarOpen: true,
        pendingRule: null,
        resolvePending: vi.fn(),
        applyWithUndo: vi.fn(),
        undoApply: vi.fn(),
        fieldUndo: null,
        activeSection: null,
        setActiveSection: vi.fn(),
        open: vi.fn(),
        openNew: vi.fn(),
        addFirstField: vi.fn(),
        addFirstSqlColumn: vi.fn(),
        addFirstFieldOnTile: vi.fn(),
        removeLastField: vi.fn(),
        emptiedFieldLabel: null,
        highlightedFieldId: null,
        setHighlightedFieldId: vi.fn(),
        clearHighlightedField: vi.fn(),
        hoveredFieldId: null,
        setHoveredFieldId: vi.fn(),
        tileHoverOwner: { current: null },
        activeFieldId: null,
        waitingFieldIds: [],
        addWaitingField: vi.fn(),
        removeWaitingField: vi.fn(),
        updateFilter: vi.fn(),
        updateOtherFilters: vi.fn(),
        removeFilterById: vi.fn(),
        discard: vi.fn(),
        close: vi.fn(),
        isDirty: true,
        newTileUuids: [],
        dismissedLinks: [],
        dismissLink: vi.fn(),
        ...overrides,
    };
    mockSidebar.current = value;
    return value;
};

// Seeds a real dashboard store from the context fixture, again on rerender
const renderWithProviders = (
    ui: ReactElement,
    dashboardFilters: DashboardFilters = {
        dimensions: [],
        metrics: [],
        tableCalculations: [],
    },
    dashboardTemporaryFilters?: DashboardFilters,
) => {
    const store = seedDashboardEditState(
        createDashboardTestStore({
            dashboardFilters,
            dashboardTemporaryFilters,
        }),
        mockDashboardContext.current as DashboardEditTestValues,
    );
    const wrap = (node: ReactElement) => (
        <DashboardStoreTestProvider store={store}>
            {node}
        </DashboardStoreTestProvider>
    );
    const result = renderWithAppProviders(wrap(ui));
    return {
        ...result,
        store,
        rerender: (node: ReactElement) => {
            act(() => {
                seedDashboardEditState(
                    store,
                    mockDashboardContext.current as DashboardEditTestValues,
                );
            });
            result.rerender(wrap(node));
        },
    };
};

describe('ControlSidebar', () => {
    beforeEach(() => {
        mockDashboardContext.current = {
            allFilterableFields: [field],
            allFilterableFieldsMap: { [FIELD_ID]: field },
            dashboardTiles: [
                tile('a', undefined),
                tile('b', undefined),
                tile('c', undefined),
            ],
            dashboardTabs: [],
            hiddenFilterableFieldIds: new Set<string>(),
            filterableFieldsByTileUuid: {
                a: [field],
                b: [field, { ...field, name: 'region', label: 'Region' }],
            },
        };
    });

    const filters = (dimensions: DashboardFilterRule[]): DashboardFilters => ({
        dimensions,
        metrics: [],
        tableCalculations: [],
    });

    const placeholder = makeRule({ target: { fieldId: '', tableName: '' } });
    const button = (name: string) => screen.getByRole('button', { name });

    it('summarises the tiles and fields of the open filter', () => {
        setSidebar({});
        const { rerender } = renderWithProviders(<ControlSidebar />);
        expect(screen.getByTestId('tiles-summary')).toHaveTextContent(
            '2 tiles · 1 field',
        );

        setSidebar({
            editingRule: makeRule({ tileTargets: { a: false, b: REGION } }),
        });
        rerender(<ControlSidebar />);
        expect(screen.getByTestId('tiles-summary')).toHaveTextContent(
            '1 tile · 2 fields',
        );
    });

    it('counts the tiles over every tab', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')],
            dashboardTabs: [tab('t1', 0), tab('t2', 1)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(screen.getByTestId('tiles-summary')).toHaveTextContent(
            '2 tiles · 1 field',
        );
    });

    it('renders nothing while no filter is edited', () => {
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        const { container } = renderWithProviders(<ControlSidebar />);
        expect(container.querySelector('[data-controls-editor]')).toBeNull();
    });

    it('heads the rail with the filter alone: its type and name, no count, menu or X', () => {
        setSidebar({
            isNew: false,
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        const { container } = renderWithProviders(
            <ControlSidebar />,
            filters([makeRule({ label: 'Order status' })]),
        );
        const header = container.querySelector(
            '[data-controls-editor] > [class*="header"]',
        ) as HTMLElement;
        expect(header).toHaveTextContent(/^Order status$/);
        expect(header.querySelector('svg')).not.toBeNull();
        expect(container.querySelector('.mantine-Badge-root')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
        // Removing is the pill's X; Cancel is the way to discard
        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).toBeNull();
        expect(screen.queryByRole('button', { name: /Discard/ })).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Collapse filter' }),
        ).toBeNull();
    });

    it('is a region named by the filter it edits', () => {
        setSidebar({ editingRule: makeRule({ label: 'Order status' }) });
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByRole('region', { name: 'Order status' }),
        ).toHaveAttribute('data-controls-editor');
        expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
            'Order status',
        );
    });

    it('badges a changed filter Edited, and a new one with a field New', () => {
        setSidebar({ isNew: false, isDirty: true });
        const { container, rerender } = renderWithProviders(<ControlSidebar />);
        const badge = () => container.querySelector('.mantine-Badge-root');
        expect(badge()).toHaveTextContent('Edited');

        setSidebar({ isNew: true, isDirty: true });
        rerender(<ControlSidebar />);
        expect(badge()).toHaveTextContent('New');

        // A new filter with no field yet has nothing to lose
        setSidebar({
            isNew: true,
            isDirty: false,
            isPlaceholder: true,
            editingRule: placeholder,
        });
        rerender(<ControlSidebar />);
        expect(badge()).toBeNull();
    });

    it('ends with Cancel and Apply, the only filled button', () => {
        const { close, discard } = setSidebar({ isNew: false });
        renderWithProviders(<ControlSidebar />);

        const apply = button('Apply');
        expect(apply).toBeEnabled();
        expect(apply).toHaveAttribute('data-controls-apply');
        expect(button('Cancel')).toHaveAttribute('data-variant', 'default');
        expect(screen.queryByRole('switch')).toBeNull();
        expect(screen.queryByText(/stays off|to keep/)).toBeNull();

        fireEvent.click(apply);
        expect(close).toHaveBeenCalledTimes(1);
        fireEvent.click(button('Cancel'));
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('opens a new filter on its field search, with Create disabled until a field', () => {
        const { discard } = setSidebar({
            isPlaceholder: true,
            editingRule: placeholder,
        });
        const { container, rerender } = renderWithProviders(<ControlSidebar />);

        expect(screen.getByText('New filter')).toBeInTheDocument();
        expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-settings')).not.toBeInTheDocument();
        // No field yet: no type to show
        expect(container.querySelector('[class*="header"] svg')).toBeNull();
        expect(button('Create')).toBeDisabled();
        fireEvent.click(button('Cancel'));
        expect(discard).toHaveBeenCalledTimes(1);

        setSidebar({ isPlaceholder: false, editingRule: makeRule({}) });
        rerender(<ControlSidebar />);
        expect(button('Create')).toBeEnabled();
    });

    it('keeps the name of an existing control left with no field, Apply disabled', () => {
        setSidebar({
            isNew: false,
            isPlaceholder: true,
            emptiedFieldLabel: 'Status',
            editingRule: makeRule({
                label: 'Order status',
                target: { fieldId: '', tableName: '' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.queryByText('New filter')).not.toBeInTheDocument();
        const label = screen.getByLabelText('Name');
        expect(label).toHaveValue('Order status');
        expect(label).toHaveAttribute('placeholder', 'Status');
        expect(button('Apply')).toBeDisabled();
    });

    describe('a pill clicked with changes unapplied', () => {
        const region = makeRule({ id: 'filter-2', label: 'Region' });

        it('asks in the footer: Discard or Apply, then that filter opens', () => {
            const { resolvePending, close, discard } = setSidebar({
                isNew: false,
                pendingRule: region,
            });
            renderWithProviders(<ControlSidebar />);

            expect(
                screen.getByText('Apply before opening Region?'),
            ).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Cancel' }),
            ).not.toBeInTheDocument();
            fireEvent.click(button('Discard'));
            expect(resolvePending).toHaveBeenLastCalledWith(false);
            fireEvent.click(button('Apply'));
            expect(resolvePending).toHaveBeenLastCalledWith(true);
            expect(close).not.toHaveBeenCalled();
            expect(discard).not.toHaveBeenCalled();
        });

        it('keeps the focused Apply as the footer changes', () => {
            setSidebar({ isNew: false });
            const { rerender } = renderWithProviders(<ControlSidebar />);
            act(() => button('Apply').focus());

            setSidebar({ isNew: false, pendingRule: region });
            rerender(<ControlSidebar />);
            expect(button('Apply')).toHaveFocus();
        });

        it('reads Create for a new filter, by the field name of the pill', () => {
            setSidebar({
                isNew: true,
                pendingRule: makeRule({ id: 'filter-2' }),
            });
            renderWithProviders(<ControlSidebar />);
            expect(
                screen.getByText('Create before opening Status?'),
            ).toBeInTheDocument();
            expect(button('Create')).toBeEnabled();
        });
    });

    describe('section', () => {
        const withSections = () => {
            mockDashboardContext.current.dashboard = {
                config: {
                    isDateZoomDisabled: false,
                    controlSections: [
                        { id: 'section-a', name: 'Dates' },
                        { id: 'section-b', name: 'Regions' },
                    ],
                },
            };
        };

        it('picks the section live: None, then each section in order', async () => {
            withSections();
            const { updateFilter, editingRule } = setSidebar({
                editingRule: makeRule({ sectionId: 'section-b' }),
            });
            renderWithProviders(<ControlSidebar />);

            const select = screen.getByRole('combobox', { name: 'Section' });
            expect(select).toHaveValue('Regions');
            await userEvent.click(select);
            expect(
                screen
                    .getAllByRole('option')
                    .map((option) => option.textContent),
            ).toEqual(['None', 'Dates', 'Regions']);
            await userEvent.click(
                screen.getByRole('option', { name: 'Dates' }),
            );
            expect(updateFilter).toHaveBeenLastCalledWith({
                ...editingRule,
                sectionId: 'section-a',
            });

            await userEvent.click(select);
            await userEvent.click(screen.getByRole('option', { name: 'None' }));
            const unsectioned = vi.mocked(updateFilter).mock.lastCall?.[0];
            expect(unsectioned && 'sectionId' in unsectioned).toBe(false);
        });

        it('is not offered without sections, nor to a viewer', () => {
            setSidebar({});
            const { unmount } = renderWithProviders(<ControlSidebar />);
            expect(
                screen.queryByRole('combobox', { name: 'Section' }),
            ).not.toBeInTheDocument();
            unmount();

            withSections();
            setSidebar({ isViewer: true });
            renderWithProviders(<ControlSidebar />);
            expect(
                screen.queryByRole('combobox', { name: 'Section' }),
            ).not.toBeInTheDocument();
        });
    });

    it('names the open filter after its field while it has no label', () => {
        setSidebar({});
        renderWithProviders(<ControlSidebar />);

        const input = screen.getByLabelText('Name');
        expect(input).toHaveValue('');
        expect(input).toHaveAttribute('placeholder', 'Status');
        expect(screen.getByTestId('filter-settings')).toHaveTextContent(
            'Settings for Status',
        );
    });

    it('names a filter whose field is gone "Filter name"', () => {
        setSidebar({
            editingRule: makeRule({
                target: { fieldId: 'orders_gone', tableName: 'orders' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByLabelText('Name')).toHaveAttribute(
            'placeholder',
            'Filter name',
        );
    });

    describe('a metric filter', () => {
        const revenue = {
            ...field,
            fieldType: 'metric',
            type: 'sum',
            name: 'revenue',
            label: 'Revenue',
        };
        const metricRule = makeRule({
            target: { fieldId: 'orders_revenue', tableName: 'orders' },
        });

        beforeEach(() => {
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                allFilterableMetricsMap: { orders_revenue: revenue },
                filterableFieldsByTileUuid: { a: [field, revenue] },
            };
        });

        it('is named by its metric and hands it to its settings', () => {
            setSidebar({ editingRule: metricRule });
            renderWithProviders(<ControlSidebar />);

            expect(screen.getByLabelText('Name')).toHaveAttribute(
                'placeholder',
                'Revenue',
            );
            expect(screen.getByTestId('filter-settings')).toHaveTextContent(
                'Settings for Revenue',
            );
            expect(screen.getByTestId('tiles-summary')).toHaveTextContent(
                '1 tile · 1 field',
            );
        });
    });

    it('names a SQL column filter by its column, with settings with no field', () => {
        setSidebar({
            editingRule: makeRule({
                target: {
                    fieldId: 'country',
                    tableName: 'sql_chart',
                    isSqlColumn: true,
                },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByLabelText('Name')).toHaveAttribute(
            'placeholder',
            'country',
        );
        expect(screen.getByTestId('filter-settings')).toHaveTextContent(
            'Settings with no field',
        );
    });

    it('moves focus to the label when the editor opens', () => {
        setSidebar({});
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByLabelText('Name')).toHaveFocus();
    });

    it('moves focus to the field search when a new filter opens', async () => {
        setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({ target: { fieldId: '', tableName: '' } }),
        });
        renderWithProviders(<ControlSidebar />);

        // Handed over on the next frame, once the rail can take focus
        await waitFor(() =>
            expect(screen.getByLabelText('Search fields')).toHaveFocus(),
        );
    });

    it('stays open on Enter with no label', () => {
        const { close } = setSidebar({});
        renderWithProviders(<ControlSidebar />);

        fireEvent.keyDown(screen.getByLabelText('Name'), {
            key: 'Enter',
        });
        expect(close).not.toHaveBeenCalled();
    });

    describe('label draft', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        const labelInput = () => screen.getByLabelText('Name');
        const typeLabel = (value: string) =>
            fireEvent.change(labelInput(), { target: { value } });

        it('reacts to typing at once and writes the label after a pause', () => {
            vi.useFakeTimers();
            const { updateFilter, editingRule } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            typeLabel('Or');
            typeLabel('Order');
            expect(labelInput()).toHaveValue('Order');
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY - 1);
            });
            expect(updateFilter).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(1);
            });
            expect(updateFilter).toHaveBeenCalledTimes(1);
            expect(updateFilter).toHaveBeenCalledWith({
                ...editingRule,
                label: 'Order',
            });
        });

        it('writes an emptied label as no label, with no error', () => {
            const { updateFilter, editingRule } = setSidebar({
                editingRule: makeRule({ label: 'Order status' }),
            });
            renderWithProviders(<ControlSidebar />);

            typeLabel('');
            fireEvent.blur(labelInput());

            expect(updateFilter).toHaveBeenCalledTimes(1);
            expect(updateFilter).toHaveBeenCalledWith({
                ...editingRule,
                label: undefined,
            });
            expect(labelInput()).toHaveAttribute('placeholder', 'Status');
        });

        it('writes a label of spaces as no label', () => {
            const { updateFilter, editingRule } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            typeLabel('   ');
            fireEvent.blur(labelInput());

            expect(updateFilter).toHaveBeenLastCalledWith({
                ...editingRule,
                label: undefined,
            });
        });

        it('leaves a rule that had no label exactly as it was once the label is emptied again', () => {
            // As a saved rule arrives: no label key at all
            const saved: DashboardFilterRule = JSON.parse(
                JSON.stringify(makeRule({})),
            );
            expect('label' in saved).toBe(false);
            const { updateFilter } = setSidebar({
                isNew: false,
                editingRule: saved,
            });
            const { rerender } = renderWithProviders(<ControlSidebar />);

            typeLabel('Status of the order');
            fireEvent.blur(labelInput());
            const typed = vi.mocked(updateFilter).mock.calls[0][0];
            expect(typed.label).toBe('Status of the order');

            setSidebar({ isNew: false, editingRule: typed, updateFilter });
            rerender(<ControlSidebar />);
            typeLabel('');
            fireEvent.blur(labelInput());

            const reverted = vi.mocked(updateFilter).mock.calls[1][0];
            expect(reverted).toStrictEqual(saved);
            expect('label' in reverted).toBe(false);
        });

        it('trims the outer spaces of a label when it is written', () => {
            const { updateFilter } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            typeLabel('  Order status ');
            fireEvent.blur(labelInput());

            expect(vi.mocked(updateFilter).mock.calls[0][0].label).toBe(
                'Order status',
            );
        });

        it('sends the typed label before Apply closes', async () => {
            const { updateFilter, close, editingRule } = setSidebar({
                isNew: false,
            });
            renderWithProviders(<ControlSidebar />);

            await userEvent.type(labelInput(), 'Order status');
            await userEvent.click(
                screen.getByRole('button', { name: 'Apply' }),
            );

            expect(updateFilter).toHaveBeenLastCalledWith({
                ...editingRule,
                label: 'Order status',
            });
            expect(close).toHaveBeenCalledTimes(1);
            expect(
                vi.mocked(updateFilter).mock.invocationCallOrder.at(-1),
            ).toBeLessThan(vi.mocked(close).mock.invocationCallOrder[0]);
        });

        it('sends the typed label on Enter, once, and stays open', () => {
            vi.useFakeTimers();
            const { updateFilter, close, editingRule } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            typeLabel('Order status');
            fireEvent.keyDown(labelInput(), { key: 'Enter' });

            expect(updateFilter).toHaveBeenCalledWith({
                ...editingRule,
                label: 'Order status',
            });
            expect(close).not.toHaveBeenCalled();
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            });
            expect(updateFilter).toHaveBeenCalledTimes(1);
        });

        it('starts over when another filter is opened, with no late write', () => {
            vi.useFakeTimers();
            const first = setSidebar({ isNew: false });
            const { rerender } = renderWithProviders(<ControlSidebar />);
            typeLabel('Half typed');

            const second = setSidebar({
                isNew: false,
                editing: { filterId: 'filter-2' },
                editingRule: makeRule({ id: 'filter-2', label: 'Region' }),
            });
            rerender(<ControlSidebar />);

            expect(labelInput()).toHaveValue('Region');
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            });
            expect(first.updateFilter).not.toHaveBeenCalled();
            expect(second.updateFilter).not.toHaveBeenCalled();
        });

        it('writes nothing after the editor is gone', () => {
            vi.useFakeTimers();
            const { updateFilter } = setSidebar({});
            const { unmount } = renderWithProviders(<ControlSidebar />);
            typeLabel('Half typed');

            unmount();
            vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            expect(updateFilter).not.toHaveBeenCalled();
        });
    });

    describe('for a viewer', () => {
        const own = makeRule({ id: 'own', label: undefined });

        it('carries the class an embed gives the rail', () => {
            setSidebar({
                isViewer: true,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            const { container } = renderWithProviders(
                <RailContractClasses.Provider
                    value={{
                        rail: 'ld-dashboard-filter-rail',
                        addFilterDropdown: 'add-list',
                        filterDropdown: 'value-list',
                    }}
                >
                    <ControlSidebar />
                </RailContractClasses.Provider>,
            );
            expect(
                container.querySelector('[data-controls-editor]'),
            ).toHaveClass('ld-dashboard-filter-rail');
        });

        it('sends focus to the value once a new filter gets a field', () => {
            setSidebar({
                isViewer: true,
                isNew: true,
                isPlaceholder: true,
                editing: { filterId: 'own' },
                editingRule: {
                    ...own,
                    target: { fieldId: '', tableName: '' },
                },
            });
            const { rerender } = renderWithProviders(<ControlSidebar />);
            setSidebar({
                isViewer: true,
                isNew: true,
                isPlaceholder: false,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            rerender(<ControlSidebar />);
            expect(screen.getByLabelText('Operator')).toHaveFocus();
        });

        it('focuses the name of an own filter it opens', () => {
            setSidebar({
                isViewer: true,
                isNew: false,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(
                <ControlSidebar />,
                filters([]),
                filters([own]),
            );
            expect(document.activeElement).toHaveAttribute(
                'data-controls-label',
            );
        });

        it('edits their own filter in the same editor: no label input, Cancel and Apply', () => {
            const { close, discard } = setSidebar({
                isViewer: true,
                isNew: false,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(
                <ControlSidebar />,
                filters([]),
                filters([own]),
            );
            expect(
                screen.queryByRole('textbox', { name: 'Name' }),
            ).not.toBeInTheDocument();
            fireEvent.click(button('Apply'));
            expect(close).toHaveBeenCalledTimes(1);
            fireEvent.click(button('Cancel'));
            expect(discard).toHaveBeenCalledTimes(1);
        });

        it('creates a new filter of theirs with Create', () => {
            setSidebar({
                isViewer: true,
                isNew: true,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(<ControlSidebar />);
            expect(button('Create')).toBeEnabled();
        });
    });
});
