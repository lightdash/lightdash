import {
    DashboardTileTypes,
    type DashboardFilters,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { ControlSidebar } from './ControlSidebar';
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
        tilesSummary,
    }: {
        field: { label: string } | null;
        tilesSummary: string;
    }) => (
        <div data-testid="filter-settings">
            {field ? `Settings for ${field.label}` : 'Settings with no field'}
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
        isNew: true,
        isPlaceholder: false,
        editingRule: makeRule({}),
        isSidebarOpen: true,
        isRailOpen: true,
        hoveredFilterId: null,
        setHoveredFilterId: vi.fn(),
        clearHoveredFilterId: vi.fn(),
        updateFilterWithUndo: vi.fn(),
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
        activeFieldId: null,
        waitingFieldIds: [],
        addWaitingField: vi.fn(),
        removeWaitingField: vi.fn(),
        updateFilter: vi.fn(),
        updateOtherFilters: vi.fn(),
        removeFilter: vi.fn(),
        removeFilterById: vi.fn(),
        discard: vi.fn(),
        close: vi.fn(),
        collapse: vi.fn(),
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
) => {
    const store = seedDashboardEditState(
        createDashboardTestStore({ dashboardFilters }),
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

    describe('closed rows', () => {
        const other = (overrides: Partial<DashboardFilterRule>) =>
            makeRule({ id: 'filter-2', label: 'Order status', ...overrides });

        it('lists every filter, the edited one open in its place', () => {
            setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    other({}),
                    makeRule({}),
                    other({ id: 'filter-3', label: 'Region' }),
                ]),
            );

            const rows = screen.getAllByRole('button', {
                name: /Order status|Region/,
            });
            expect(rows.map((row) => row.textContent)).toEqual([
                expect.stringContaining('Order status'),
                expect.stringContaining('Region'),
            ]);
            const label = screen.getByLabelText('Filter label');
            expect(
                rows[0].compareDocumentPosition(label) &
                    Node.DOCUMENT_POSITION_FOLLOWING,
            ).toBeTruthy();
            expect(
                rows[1].compareDocumentPosition(label) &
                    Node.DOCUMENT_POSITION_PRECEDING,
            ).toBeTruthy();
        });

        it('reads the value on one line, then Locked and Required', () => {
            setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({}),
                    other({ lockedTabUuids: ['dashboard-1'], required: true }),
                ]),
            );

            const row = screen.getByRole('button', { name: /Order status/ });
            expect(row).toHaveTextContent(
                /done · Filter is locked · Required$/,
            );
            expect(screen.getByText('Required')).toHaveClass(/required/);
        });

        it('says a required filter with no value has none yet', () => {
            setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([makeRule({}), other({ required: true, values: [] })]),
            );

            const row = screen.getByRole('button', { name: /Order status/ });
            expect(row).toHaveTextContent(
                /Required: set a value to run this dashboard$/,
            );
            expect(row).not.toHaveTextContent('done');
        });

        it('opens the filter of a row on click', () => {
            const { open } = setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([makeRule({}), other({})]),
            );

            fireEvent.click(
                screen.getByRole('button', { name: /Order status/ }),
            );
            expect(open).toHaveBeenCalledWith('filter-2');
        });

        it('disables a row whose field cannot be resolved', () => {
            setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({}),
                    other({
                        target: { fieldId: 'orders_gone', tableName: 'orders' },
                    }),
                ]),
            );

            expect(
                screen.getByRole('button', { name: /Order status/ }),
            ).toBeDisabled();
        });
    });

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

    it('renders nothing while the rail is closed', () => {
        setSidebar({
            editing: null,
            editingRule: null,
            isSidebarOpen: false,
            isRailOpen: false,
        });
        renderWithProviders(<ControlSidebar />);
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
    });

    it('lists every filter as a row while the rail is open with none expanded', () => {
        const { open, close } = setSidebar({
            editing: null,
            editingRule: null,
            isSidebarOpen: false,
        });
        renderWithProviders(
            <ControlSidebar />,
            filters([
                makeRule({ label: 'Order status' }),
                makeRule({ id: 'filter-2', label: 'Region' }),
            ]),
        );

        expect(screen.queryByLabelText('Filter label')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /Region/ }));
        expect(open).toHaveBeenCalledWith('filter-2');
        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('shows only the footer once the last filter is gone', () => {
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('button', { name: 'Add filter' }),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();
        expect(screen.queryByText(/to keep|stays off/)).not.toBeInTheDocument();
    });

    it('collapses the open filter from its chevron and its head, never from the input or buttons', () => {
        const { collapse, discard } = setSidebar({
            isNew: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        const chevron = screen.getByRole('button', { name: 'Collapse filter' });
        expect(chevron).toHaveAttribute('aria-expanded', 'true');
        fireEvent.click(chevron);
        expect(collapse).toHaveBeenCalledTimes(1);

        const input = screen.getByLabelText('Filter label');
        fireEvent.click(input.closest('[class*="editedHead"]') as HTMLElement);
        expect(collapse).toHaveBeenCalledTimes(2);

        fireEvent.click(input);
        fireEvent.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );
        expect(collapse).toHaveBeenCalledTimes(2);
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('reports the row under the pointer or focus as hovered, and its leaving', () => {
        const { setHoveredFilterId, clearHoveredFilterId } = setSidebar({
            isNew: false,
        });
        renderWithProviders(
            <ControlSidebar />,
            filters([
                makeRule({}),
                makeRule({ id: 'filter-2', label: 'Region' }),
            ]),
        );

        const row = screen.getByRole('button', { name: /Region/ });
        expect(row).toHaveAttribute('data-controls-row', 'filter-2');
        expect(row).toHaveAttribute('aria-expanded', 'false');
        fireEvent.mouseEnter(row);
        expect(setHoveredFilterId).toHaveBeenLastCalledWith('filter-2');
        fireEvent.mouseLeave(row);
        expect(clearHoveredFilterId).toHaveBeenLastCalledWith('filter-2');
        act(() => row.focus());
        expect(setHoveredFilterId).toHaveBeenLastCalledWith('filter-2');
        act(() => row.blur());
        expect(clearHoveredFilterId).toHaveBeenLastCalledWith('filter-2');
        expect(setHoveredFilterId).not.toHaveBeenCalledWith(null);
    });

    it('opens a new filter on its field search, with Cancel as the only way out', () => {
        const { discard, openNew, close } = setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({
                target: { fieldId: '', tableName: '' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByText('New filter')).toBeInTheDocument();
        expect(screen.queryByLabelText('Filter label')).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: /Discard/ }),
        ).not.toBeInTheDocument();
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-settings')).not.toBeInTheDocument();
        expect(
            screen.getByText('Select a field to keep this filter'),
        ).toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Add filter' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('button', { name: 'Done' }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(discard).toHaveBeenCalledTimes(1);
        expect(openNew).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });

    it('keeps the name of an existing control left with no field', () => {
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
        const label = screen.getByLabelText('Filter label');
        expect(label).toHaveValue('Order status');
        expect(label).toHaveAttribute('placeholder', 'Status');
        expect(
            screen.getByText('Select a field to keep this filter'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
    });

    it('names the open filter after its field while it has no label', () => {
        setSidebar({});
        renderWithProviders(<ControlSidebar />);

        const input = screen.getByLabelText('Filter label');
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

        expect(screen.getByLabelText('Filter label')).toHaveAttribute(
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

            expect(screen.getByLabelText('Filter label')).toHaveAttribute(
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

        expect(screen.getByLabelText('Filter label')).toHaveAttribute(
            'placeholder',
            'country',
        );
        expect(screen.getByTestId('filter-settings')).toHaveTextContent(
            'Settings with no field',
        );
    });

    it('closes with a missing default value and says it stays off', () => {
        const { close } = setSidebar({
            editingRule: makeRule({ label: 'Order status', values: [] }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByText('No default value set, so the default stays off'),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('says nothing in the footer for a filter that can be kept', () => {
        setSidebar({
            isNew: false,
            editingRule: makeRule({ label: 'Order status', disabled: true }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.queryByText(/to keep/)).not.toBeInTheDocument();
        expect(screen.queryByText(/stays off/)).not.toBeInTheDocument();
    });

    it('moves focus to the label when the editor opens', () => {
        setSidebar({});
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByLabelText('Filter label')).toHaveFocus();
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

        fireEvent.keyDown(screen.getByLabelText('Filter label'), {
            key: 'Enter',
        });
        expect(close).not.toHaveBeenCalled();
    });

    it('closes on Done and the X, adds on Add filter, and discards a new filter from its icon', () => {
        const { close, discard, openNew } = setSidebar({
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByRole('heading', { name: 'Filters' })).toBeVisible();
        // The count badge reads as words, not a bare number
        expect(
            screen.getByRole('heading', { name: 'Filters' }).nextElementSibling
                ?.textContent,
        ).toMatch(/^\d+ filters$/);
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledTimes(2);

        fireEvent.click(screen.getByRole('button', { name: 'Add filter' }));
        expect(openNew).toHaveBeenCalledTimes(1);

        expect(screen.queryByLabelText('More actions')).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('Remove filter'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Discard filter' }));
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('offers Discard changes only once an existing filter has changed', () => {
        const { discard } = setSidebar({
            isNew: false,
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        const { rerender } = renderWithProviders(<ControlSidebar />);
        expect(
            screen.queryByRole('button', { name: /Discard/ }),
        ).not.toBeInTheDocument();

        setSidebar({
            isNew: false,
            isDirty: true,
            discard,
            editingRule: makeRule({ label: 'Order status' }),
        });
        rerender(<ControlSidebar />);
        fireEvent.click(
            screen.getByRole('button', { name: 'Discard changes' }),
        );
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('removes an existing filter on the second click', async () => {
        const { removeFilter } = setSidebar({
            isNew: false,
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        const remove = screen.getByRole('button', { name: 'Remove filter' });
        fireEvent.click(remove);
        expect(removeFilter).not.toHaveBeenCalled();
        expect(remove).toHaveAttribute('aria-pressed', 'true');
        fireEvent.click(remove);
        expect(removeFilter).toHaveBeenCalledTimes(1);
    });

    describe('label draft', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        const labelInput = () => screen.getByLabelText('Filter label');
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

        it('sends the typed label before Done closes', async () => {
            const { updateFilter, close, editingRule } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            await userEvent.type(labelInput(), 'Order status');
            await userEvent.click(screen.getByRole('button', { name: 'Done' }));

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
});
