import {
    DashboardTileTypes,
    DEFAULT_UI_STRINGS,
    type DashboardFilters,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import {
    act,
    fireEvent,
    screen,
    waitFor,
    within,
} from '@testing-library/react';
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
import {
    dashboardFiltersActions,
    selectControlSections,
    selectDashboardFilters,
} from '../dashboard/store';
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
        tilesSummary,
    }: {
        field: { label: string } | null;
        tilesSummary: string;
    }) => (
        <div data-testid="filter-settings">
            <div data-controls-value>
                <input aria-label="Operator" />
            </div>
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
        isViewer: false,
        canAddFilters: true,
        isNew: true,
        isPlaceholder: false,
        editingRule: makeRule({}),
        isSidebarOpen: true,
        isRailOpen: true,
        hoveredFilterId: null,
        setHoveredFilterId: vi.fn(),
        clearHoveredFilterId: vi.fn(),
        applyWithUndo: vi.fn(),
        undoApply: vi.fn(),
        fieldUndo: null,
        activeSection: null,
        setActiveSection: vi.fn(),
        open: vi.fn(),
        openNew: vi.fn(),
        openRail: vi.fn(),
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
                name: /^Order status|^Region/,
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

            const row = screen.getByRole('button', { name: /^Order status/ });
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

            const row = screen.getByRole('button', { name: /^Order status/ });
            expect(row).toHaveTextContent(
                /Required: set a value to run this dashboard$/,
            );
            expect(row).not.toHaveTextContent('done');
        });

        it('reads a group member as met while its alternative has a value', () => {
            setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ requiredGroupId: 'group-1' }),
                    other({ requiredGroupId: 'group-1', values: [] }),
                ]),
            );

            const row = screen.getByRole('button', { name: /^Order status/ });
            expect(row).toHaveTextContent(/· Required$/);
            expect(row).not.toHaveTextContent(/set a value/);
        });

        it('gives an unmet group member the group wording', () => {
            setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ requiredGroupId: 'group-1', values: [] }),
                    other({ requiredGroupId: 'group-1', values: [] }),
                ]),
            );

            const row = screen.getByRole('button', { name: /^Order status/ });
            expect(row).toHaveTextContent(
                DEFAULT_UI_STRINGS['filters.required.setValueGroupTooltip'],
            );
        });

        it('opens the filter of a row on click', () => {
            const { open } = setSidebar({ isNew: false });
            renderWithProviders(
                <ControlSidebar />,
                filters([makeRule({}), other({})]),
            );

            fireEvent.click(
                screen.getByRole('button', { name: /^Order status/ }),
            );
            expect(open).toHaveBeenCalledWith('filter-2');
        });

        it('leaves a row whose field cannot be resolved one that opens nothing', () => {
            const { open } = setSidebar({ isNew: false });
            const { container } = renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({}),
                    other({
                        target: { fieldId: 'orders_gone', tableName: 'orders' },
                    }),
                ]),
            );

            const row = container.querySelector(
                '[data-controls-row="filter-2"]',
            );
            expect(row?.tagName).not.toBe('BUTTON');
            expect(row).toHaveAttribute('aria-disabled', 'true');
            fireEvent.click(row as Element);
            expect(open).not.toHaveBeenCalled();
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
        fireEvent.click(screen.getByRole('button', { name: /^Region/ }));
        expect(open).toHaveBeenCalledWith('filter-2');
        expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);
    });

    it('shows only the footer once the last filter is gone', () => {
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByRole('button', { name: 'Add' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();
        expect(screen.queryByText(/to keep|stays off/)).not.toBeInTheDocument();
    });

    describe('keyboard', () => {
        const rows = () =>
            filters([
                makeRule({ label: 'Order status' }),
                makeRule({ id: 'filter-2', label: 'Region' }),
            ]);
        const row = (id: string) =>
            document.querySelector<HTMLElement>(`[data-controls-row="${id}"]`);

        it('takes focus on its first row when it opens with nothing else focused', () => {
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
            (document.activeElement as HTMLElement | null)?.blur();
            renderWithProviders(<ControlSidebar />, rows());
            expect(row('filter-1')).toHaveFocus();
        });

        it('takes focus on Add when it opens with no filter', () => {
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
            (document.activeElement as HTMLElement | null)?.blur();
            renderWithProviders(<ControlSidebar />);
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
        });

        it('has one tab stop: Tab from Add lands on the first row, the next Tab leaves the list', async () => {
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
            renderWithProviders(<ControlSidebar />, rows());
            // The header's last control sits right before the list
            screen.getByRole('button', { name: 'Close' }).focus();

            await userEvent.tab();
            expect(row('filter-1')).toHaveFocus();
            await userEvent.tab();
            // Out of the list: the footer's first control, not a second row
            expect(screen.getByRole('switch')).toHaveFocus();
            expect(
                screen.getAllByRole('button', { name: /^Drag to reorder/ }),
            ).toSatisfy((grips: HTMLElement[]) =>
                grips.every((grip) => grip.tabIndex === -1),
            );
            expect(
                screen.getAllByRole('button', { name: 'Remove filter' }),
            ).toSatisfy((removes: HTMLElement[]) =>
                removes.every((remove) => remove.tabIndex === -1),
            );
        });

        it('walks the rows with the arrows, and the focused row becomes the stop', async () => {
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
            renderWithProviders(<ControlSidebar />, rows());
            row('filter-1')?.focus();
            fireEvent.keyDown(row('filter-1') as HTMLElement, {
                key: 'ArrowDown',
            });
            expect(row('filter-2')).toHaveFocus();
            expect(row('filter-2')).toHaveAttribute('tabindex', '0');
            expect(row('filter-1')).toHaveAttribute('tabindex', '-1');
            fireEvent.keyDown(row('filter-2') as HTMLElement, {
                key: 'ArrowUp',
            });
            expect(row('filter-1')).toHaveFocus();
        });

        it('picks the row up for a keyboard drag on Space, and does not open it', async () => {
            const { open } = setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
            renderWithProviders(<ControlSidebar />, rows());
            row('filter-1')?.focus();
            fireEvent.keyDown(row('filter-1') as HTMLElement, { key: ' ' });
            expect(row('filter-1')?.parentElement).toHaveAttribute(
                'data-dragging',
            );
            expect(
                screen.getAllByRole('button', { name: /^Drag to reorder/ })[0],
            ).toHaveFocus();
            expect(open).not.toHaveBeenCalled();
            // The sensor listens from the next tick on; leave nothing behind
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
            expect(row('filter-1')?.parentElement).not.toHaveAttribute(
                'data-dragging',
            );
        });

        it('arms the row remove on Delete and removes on the second', () => {
            const removeFilterById = vi.fn();
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
                removeFilterById,
            });
            renderWithProviders(<ControlSidebar />, rows());
            row('filter-1')?.focus();
            fireEvent.keyDown(row('filter-1') as HTMLElement, {
                key: 'Delete',
            });
            expect(removeFilterById).not.toHaveBeenCalled();
            expect(
                screen.getAllByRole('button', { name: 'Remove filter' })[0],
            ).toHaveAttribute('aria-pressed', 'true');
            fireEvent.keyDown(row('filter-1') as HTMLElement, {
                key: 'Delete',
            });
            expect(removeFilterById).toHaveBeenCalledWith('filter-1');
        });
    });

    it("lets an editor switch viewers' own filters on and off from the footer", () => {
        const setIsAddFilterDisabled = vi.fn();
        mockDashboardContext.current.setIsAddFilterDisabled =
            setIsAddFilterDisabled;
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        const { rerender } = renderWithProviders(<ControlSidebar />);
        const toggle = () =>
            screen.getByRole('switch', {
                name: 'Viewers can add filters',
            });
        expect(toggle()).toBeChecked();
        fireEvent.click(toggle());
        expect(setIsAddFilterDisabled).toHaveBeenCalledWith(true);

        mockDashboardContext.current.isAddFilterDisabled = true;
        rerender(<ControlSidebar />);
        expect(toggle()).not.toBeChecked();
        fireEvent.click(toggle());
        expect(setIsAddFilterDisabled).toHaveBeenLastCalledWith(false);
    });

    it('offers no viewers switch to a viewer, nor while a new filter has no field', () => {
        setSidebar({
            isViewer: true,
            editing: null,
            editingRule: null,
            isSidebarOpen: false,
        });
        const { unmount } = renderWithProviders(<ControlSidebar />);
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
        unmount();

        setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({ target: { fieldId: '', tableName: '' } }),
        });
        renderWithProviders(<ControlSidebar />);
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeVisible();
        expect(screen.queryByRole('switch')).not.toBeInTheDocument();
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

        const row = screen.getByRole('button', { name: /^Region/ });
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
            screen.queryByRole('button', { name: 'Done' }),
        ).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(discard).toHaveBeenCalledTimes(1);
        expect(openNew).not.toHaveBeenCalled();
        expect(close).not.toHaveBeenCalled();
    });

    it('counts the filters in the header from 1, with no badge at 0', () => {
        setSidebar({ editing: null, editingRule: null });
        const { container, unmount } = renderWithProviders(
            <ControlSidebar />,
            filters([]),
        );
        expect(container.querySelector('.mantine-Badge-root')).toBeNull();
        unmount();

        const { container: withOne, unmount: unmountOne } = renderWithProviders(
            <ControlSidebar />,
            filters([makeRule({})]),
        );
        expect(withOne.querySelector('.mantine-Badge-root')).toHaveTextContent(
            /^1 filter$/,
        );
        unmountOne();

        const { container: withTwo } = renderWithProviders(
            <ControlSidebar />,
            filters([makeRule({}), makeRule({ id: 'filter-2' })]),
        );
        expect(withTwo.querySelector('.mantine-Badge-root')).toHaveTextContent(
            /^2 filters$/,
        );
    });

    it('shows no type icon in the head until the new filter has a field', () => {
        setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({
                target: { fieldId: '', tableName: '' },
            }),
        });
        const { container, rerender } = renderWithProviders(<ControlSidebar />);
        const headIcon = () =>
            container.querySelector('[class*="editedHead"] [class*="rowIcon"]');
        expect(headIcon()).toBeNull();

        setSidebar({ isPlaceholder: false, editingRule: makeRule({}) });
        rerender(<ControlSidebar />);
        expect(headIcon()).not.toBeNull();
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

    it('closes on Done and the X, adds from the header menu, and discards a new filter from its icon', async () => {
        const { close, discard, openNew } = setSidebar({
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(
            <ControlSidebar />,
            filters([makeRule({ label: 'Order status' })]),
        );

        expect(screen.getByRole('heading', { name: 'Filters' })).toBeVisible();
        // The count badge reads as words, not a bare number
        expect(
            screen.getByRole('heading', { name: 'Filters' }).nextElementSibling
                ?.textContent,
        ).toMatch(/^1 filter$/);
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledTimes(2);

        await userEvent.click(screen.getByRole('button', { name: 'Add' }));
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'Add filter' }),
        );
        expect(openNew).toHaveBeenCalledTimes(1);

        expect(screen.queryByLabelText('More actions')).not.toBeInTheDocument();
        expect(
            screen.queryByLabelText('Remove filter'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Discard filter' }));
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('returns focus to Add when the menu closes on Escape, and leaves it on the name input', async () => {
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        renderWithProviders(<ControlSidebar />);
        const add = screen.getByRole('button', { name: 'Add' });

        add.focus();
        await userEvent.keyboard('{Enter}');
        await screen.findByRole('menuitem', { name: 'Add filter' });
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(add).toHaveFocus());

        await userEvent.click(add);
        await userEvent.click(
            await screen.findByRole('menuitem', { name: 'New section' }),
        );
        const input = screen.getByLabelText('Section name');
        await act(() => new Promise((resolve) => setTimeout(resolve)));
        expect(input).toHaveFocus();
    });

    it('lists "Add filter" and "New section" in the header menu for an editor', async () => {
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        renderWithProviders(<ControlSidebar />);

        await userEvent.click(screen.getByRole('button', { name: 'Add' }));
        expect(
            (await screen.findAllByRole('menuitem')).map(
                (item) => item.textContent,
            ),
        ).toEqual(['Add filter', 'New section', 'Select filters']);
    });

    it('has no header menu while nothing can be added', () => {
        setSidebar({
            editing: null,
            editingRule: null,
            isSidebarOpen: false,
            isViewer: true,
            canAddFilters: false,
        });
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.queryByRole('button', { name: 'Add' }),
        ).not.toBeInTheDocument();
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

    describe('for a viewer', () => {
        const saved = makeRule({ id: 'saved', label: 'Order status' });
        const own = makeRule({ id: 'own', label: undefined });

        it('lists only their own filters, marked "Added by you"', () => {
            setSidebar({ isViewer: true, editing: null, editingRule: null });
            renderWithProviders(
                <ControlSidebar />,
                filters([saved]),
                filters([own]),
            );
            const rows = screen
                .getAllByRole('button', { expanded: false })
                .filter((row) => row.hasAttribute('data-controls-row'));
            expect(rows.map((row) => row.dataset.controlsRow)).toEqual(['own']);
            expect(rows[0]).toHaveTextContent('Added by you');
            expect(screen.getByText('1')).toBeInTheDocument();
        });

        it('lists the saved sections read-only after their own filters', async () => {
            mockDashboardContext.current.dashboard = {
                config: {
                    isDateZoomDisabled: false,
                    controlSections: [
                        { id: 'section-a', name: 'Dates' },
                        { id: 'section-b', name: 'Empty' },
                    ],
                },
            };
            const open = vi.fn();
            setSidebar({
                isViewer: true,
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
                open,
            });
            const { container } = renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({
                        id: 'created',
                        label: 'Created',
                        sectionId: 'section-a',
                    }),
                    saved,
                ]),
                filters([own]),
            );
            const listed = [
                ...container.querySelectorAll(
                    '[data-controls-row], [data-controls-section]',
                ),
            ].map(
                (node) =>
                    node.getAttribute('data-controls-row') ??
                    `# ${node.textContent}`,
            );
            expect(listed).toEqual(['own', '# Dates1 filter', 'created']);
            expect(screen.queryByText('Empty')).not.toBeInTheDocument();
            // The badge counts their own filters only
            expect(screen.getByText('1')).toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: /^Drag to reorder/ }),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: 'Section Dates actions' }),
            ).not.toBeInTheDocument();
            await userEvent.click(screen.getByRole('button', { name: 'Add' }));
            expect(
                (await screen.findAllByRole('menuitem')).map(
                    (item) => item.textContent,
                ),
            ).toEqual(['Add filter']);
            await userEvent.keyboard('{Escape}');

            const row = container.querySelector<HTMLElement>(
                '[data-controls-row="created"]',
            );
            expect(row?.parentElement?.className).toContain('sectionRow');
            expect(row).toHaveAttribute('aria-disabled', 'true');
            expect(row).not.toHaveTextContent('Added by you');
            expect(row).toHaveAccessibleDescription(
                'Set this filter from the bar',
            );
            fireEvent.click(row as Element);
            expect(open).not.toHaveBeenCalled();
            fireEvent.mouseEnter(row as Element);
            expect(
                await screen.findByText('Set this filter from the bar'),
            ).toBeInTheDocument();

            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            expect(
                container.querySelector('[data-controls-row="created"]'),
            ).toBeNull();
            expect(
                container.querySelector('[data-controls-row="own"]'),
            ).not.toBeNull();
        });

        it('carries the class an embed gives the rail', () => {
            setSidebar({ isViewer: true, editing: null, editingRule: null });
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

        it('says which field a row cannot resolve, as the invalid pill', async () => {
            const open = vi.fn();
            setSidebar({
                isViewer: true,
                editing: null,
                editingRule: null,
                open,
            });
            const { container } = renderWithProviders(
                <ControlSidebar />,
                filters([]),
                filters([
                    {
                        ...own,
                        target: { fieldId: 'orders_gone', tableName: 'orders' },
                    },
                ]),
            );
            const row = container.querySelector<HTMLElement>(
                '[data-controls-row="own"]',
            );
            expect(row).toHaveAttribute('tabindex', '0');
            expect(row).toHaveAttribute('role', 'button');
            expect(row).toHaveAttribute('aria-disabled', 'true');
            expect(row).toHaveAccessibleName(/Added by you/);
            expect(row).toHaveAccessibleDescription(
                'Tried to reference field with unknown id: orders_gone',
            );
            fireEvent.click(row as Element);
            expect(open).not.toHaveBeenCalled();
            fireEvent.mouseEnter(row as Element);
            expect(
                await screen.findByText(
                    'Tried to reference field with unknown id: orders_gone',
                ),
            ).toBeInTheDocument();
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

        it('edits their own filter with no label input, and can remove it', () => {
            setSidebar({
                isViewer: true,
                isNew: false,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(
                <ControlSidebar />,
                filters([saved]),
                filters([own]),
            );
            expect(
                screen.queryByRole('textbox', { name: 'Filter label' }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Remove filter' }),
            ).toBeInTheDocument();
        });
    });

    describe('sections', () => {
        const sections = [
            { id: 'section-a', name: 'Dates' },
            { id: 'section-b', name: 'Regions' },
        ];
        const sectioned = () =>
            filters([
                makeRule({
                    id: 'filter-2',
                    label: 'Region',
                    sectionId: 'section-b',
                }),
                makeRule({ label: 'Order status' }),
                makeRule({
                    id: 'filter-3',
                    label: 'Created',
                    sectionId: 'section-a',
                }),
                makeRule({ id: 'filter-4', label: 'Lost', sectionId: 'gone' }),
            ]);
        const closedRail = () =>
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
        const rowNames = () =>
            [
                ...document.querySelectorAll(
                    '[data-controls-row], [data-controls-section]',
                ),
            ].map((node) =>
                node.hasAttribute('data-controls-row')
                    ? node.querySelector('p')?.textContent
                    : `# ${node.textContent}`,
            );

        beforeEach(() => {
            mockDashboardContext.current.dashboard = {
                config: {
                    isDateZoomDisabled: false,
                    controlSections: sections,
                },
            };
            mockDashboardContext.current.setDashboardFilters = vi.fn();
            mockDashboardContext.current.setHaveFiltersChanged = vi.fn();
        });

        it('lists unsectioned rows first, then each section with its count', () => {
            closedRail();
            renderWithProviders(<ControlSidebar />, sectioned());

            expect(rowNames()).toEqual([
                'Order status',
                'Lost',
                '# Dates1 filter',
                'Created',
                '# Regions1 filter',
                'Region',
            ]);
        });

        // The keyboard sensor: Space on a grip picks its row up
        const grips = () =>
            screen.getAllByRole('button', {
                name: /^Drag to reorder (?!section)/,
            });
        const pickUp = (grip: HTMLElement) =>
            act(() => {
                grip.focus();
                fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
            });

        it('indents the rows of a section, not the unsectioned ones', () => {
            closedRail();
            renderWithProviders(<ControlSidebar />, sectioned());
            const wrapperOf = (id: string) =>
                document.querySelector(`[data-controls-row="${id}"]`)
                    ?.parentElement?.className ?? '';
            expect(wrapperOf('filter-3')).toContain('sectionRow');
            expect(wrapperOf('filter-1')).not.toContain('sectionRow');
            expect(wrapperOf('filter-4')).not.toContain('sectionRow');
        });

        it('mounts nothing on pick-up: only the overlay copy, gone on Escape', async () => {
            closedRail();
            const { container } = renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ label: 'Order status' }),
                    makeRule({
                        id: 'filter-3',
                        label: 'Created',
                        sectionId: 'section-a',
                    }),
                ]),
            );
            const rows = () =>
                container.querySelectorAll('[data-controls-row]').length;
            expect(rows()).toBe(2);
            expect(screen.getAllByText('Created')).toHaveLength(1);

            pickUp(grips()[1]);
            expect(rows()).toBe(2);
            expect(screen.getAllByText('Created')).toHaveLength(2);
            expect(
                container.querySelector('[data-controls-row="filter-3"]')
                    ?.parentElement,
            ).toHaveAttribute('data-dragging');
            expect(screen.queryByText(/Drag|Drop/)).not.toBeInTheDocument();
            // The keyboard sensor falls back to the nearest centre: one
            // target, a row, never the source row
            const over = container.querySelectorAll('[data-over]');
            expect(over).toHaveLength(1);
            expect(over[0].className).toContain('sortableRow');
            expect(over[0]).not.toHaveAttribute('data-dragging');

            // The sensor listens for Escape from the next tick on
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
            expect(rows()).toBe(2);
            expect(
                container.querySelector('[data-controls-row="filter-3"]')
                    ?.parentElement,
            ).not.toHaveAttribute('data-dragging');
        });

        it('counts an empty section and hides rows when collapsed', () => {
            closedRail();
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ label: 'Created', sectionId: 'section-a' }),
                ]),
            );

            expect(screen.getByText('0 filters')).toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();
            fireEvent.click(
                screen.getByRole('button', { name: 'Expand section Dates' }),
            );
            expect(
                screen.getByRole('button', { name: /^Created/ }),
            ).toBeVisible();
        });

        const newSection = async () => {
            await userEvent.click(screen.getByRole('button', { name: 'Add' }));
            await userEvent.click(
                await screen.findByRole('menuitem', { name: 'New section' }),
            );
        };

        it('adds a section named on Enter and drops one left empty on Escape', async () => {
            closedRail();
            const { store } = renderWithProviders(<ControlSidebar />);

            await newSection();
            const input = screen.getByLabelText('Section name');
            expect(input).toHaveFocus();
            // Nothing else on the header takes a click: a blur would drop it
            expect(
                screen.queryByRole('button', {
                    name: /Untitled section actions/,
                }),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', {
                    name: 'Collapse section Untitled section',
                }),
            ).toBeDisabled();
            fireEvent.change(input, { target: { value: ' Time ' } });
            fireEvent.keyDown(input, { key: 'Enter' });
            expect(selectControlSections(store.getState())).toEqual([
                ...sections,
                { id: expect.any(String), name: 'Time' },
            ]);
            expect(screen.getByText('Time')).toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: 'Section Time actions' }),
            ).toHaveFocus();

            await newSection();
            fireEvent.keyDown(screen.getByLabelText('Section name'), {
                key: 'Escape',
            });
            expect(
                screen.queryByLabelText('Section name'),
            ).not.toBeInTheDocument();
            expect(selectControlSections(store.getState())).toHaveLength(3);
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
        });

        it('keeps a fieldless new filter open while a new section is named', async () => {
            const { collapse, discard, close } = setSidebar({
                isPlaceholder: true,
                editingRule: makeRule({
                    target: { fieldId: '', tableName: '' },
                }),
            });
            renderWithProviders(<ControlSidebar />);

            await newSection();
            expect(collapse).not.toHaveBeenCalled();
            expect(discard).not.toHaveBeenCalled();
            expect(close).not.toHaveBeenCalled();
            expect(
                screen.getByRole('heading', { name: 'Filters' }),
            ).toBeVisible();
            expect(screen.getByText('New filter')).toBeInTheDocument();
            expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
            expect(screen.getByLabelText('Section name')).toBeInTheDocument();
        });

        it('folds the expanded filter before opening a new section', async () => {
            const { collapse } = setSidebar({
                isNew: false,
                editingRule: makeRule({ label: 'Order status' }),
            });
            const { rerender } = renderWithProviders(
                <ControlSidebar />,
                filters([makeRule({ label: 'Order status' })]),
            );
            expect(screen.getByLabelText('Filter label')).toBeInTheDocument();

            await newSection();
            expect(collapse).toHaveBeenCalledTimes(1);
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
                collapse,
            });
            rerender(<ControlSidebar />);
            expect(
                screen.queryByLabelText('Filter label'),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: /^Order status/ }),
            ).toBeVisible();
            expect(screen.getByLabelText('Section name')).toBeInTheDocument();
            // Drag waits for the name
            expect(
                screen.queryByRole('button', {
                    name: /^Drag to reorder (?!section)/,
                }),
            ).not.toBeInTheDocument();
        });

        it('renames a section from its menu, keeping the name when emptied', async () => {
            closedRail();
            const { store } = renderWithProviders(<ControlSidebar />);

            await userEvent.click(
                screen.getByRole('button', { name: 'Section Dates actions' }),
            );
            await userEvent.click(
                await screen.findByRole('menuitem', { name: 'Rename' }),
            );
            const input = screen.getByLabelText('Section name');
            expect(input).toHaveValue('Dates');
            fireEvent.change(input, { target: { value: 'When' } });
            fireEvent.blur(input);
            expect(
                selectControlSections(store.getState()).map((s) => s.name),
            ).toEqual(['When', 'Regions']);
            expect(
                screen.getByRole('button', { name: 'Section When actions' }),
            ).toHaveFocus();

            await userEvent.click(
                screen.getByRole('button', { name: 'Section When actions' }),
            );
            await userEvent.click(
                await screen.findByRole('menuitem', { name: 'Rename' }),
            );
            fireEvent.change(screen.getByLabelText('Section name'), {
                target: { value: '' },
            });
            fireEvent.keyDown(screen.getByLabelText('Section name'), {
                key: 'Enter',
            });
            expect(
                selectControlSections(store.getState()).map((s) => s.name),
            ).toEqual(['When', 'Regions']);
        });

        it('removes a section and unsections its filters', async () => {
            closedRail();
            const dashboardFilters = sectioned();
            const { store } = renderWithProviders(
                <ControlSidebar />,
                dashboardFilters,
            );

            await userEvent.click(
                screen.getByRole('button', { name: 'Section Regions actions' }),
            );
            // The first click arms it and names what stays; the menu stays
            await userEvent.click(
                await screen.findByRole('menuitem', { name: 'Remove section' }),
            );
            expect(selectControlSections(store.getState())).toEqual(sections);
            const armed = screen.getByRole('menuitem', {
                name: 'Remove section · 1 filter',
            });
            expect(armed).toHaveAttribute('aria-pressed', 'true');
            await userEvent.click(armed);
            expect(selectControlSections(store.getState())).toEqual([
                sections[0],
            ]);
            const setDashboardFilters = mockDashboardContext.current
                .setDashboardFilters as ReturnType<typeof vi.fn>;
            const update = setDashboardFilters.mock.calls[0][0] as (
                f: DashboardFilters,
            ) => DashboardFilters;
            expect(
                update(dashboardFilters).dimensions.map((r) => r.sectionId),
            ).toEqual([undefined, undefined, 'section-a', 'gone']);
            expect(
                mockDashboardContext.current.setHaveFiltersChanged,
            ).toHaveBeenCalledWith(true);
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
        });

        it('lists "Add filter" first in the section menu, opening a new filter in it', async () => {
            const openNew = vi.fn();
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
                openNew,
            });
            renderWithProviders(<ControlSidebar />, sectioned());
            await userEvent.click(
                screen.getByRole('button', { name: 'Section Dates actions' }),
            );
            const items = await screen.findAllByRole('menuitem');
            expect(items.map((item) => item.textContent)).toEqual([
                'Add filter',
                'Rename',
                'Remove section',
            ]);
            await userEvent.click(items[0]);
            expect(openNew).toHaveBeenCalledWith('section-a');
        });

        it('lists a new filter under its section, and an emptied one where it was', () => {
            setSidebar({
                isPlaceholder: true,
                editingRule: makeRule({
                    id: 'new',
                    target: { fieldId: '', tableName: '' },
                    sectionId: 'section-a',
                }),
                editing: { filterId: 'new' },
            });
            const { rerender } = renderWithProviders(
                <ControlSidebar />,
                sectioned(),
            );
            const order = () =>
                [
                    ...document.querySelectorAll(
                        '[data-controls-row], [data-controls-section], [data-controls-start]',
                    ),
                ].map(
                    (node) =>
                        node.getAttribute('data-controls-row') ??
                        node.getAttribute('data-controls-section') ??
                        'editor',
                );
            expect(order()).toEqual([
                'filter-1',
                'filter-4',
                'section-a',
                'filter-3',
                'editor',
                'section-b',
                'filter-2',
            ]);
            expect(
                screen
                    .getByTestId('fields-and-tiles')
                    .closest('[class*="sectionRow"]'),
            ).not.toBeNull();

            // An existing filter that lost its field keeps its section too
            setSidebar({
                isNew: false,
                isPlaceholder: true,
                editingRule: makeRule({
                    id: 'filter-3',
                    target: { fieldId: '', tableName: '' },
                    sectionId: 'section-a',
                }),
                editing: { filterId: 'filter-3' },
            });
            rerender(<ControlSidebar />);
            expect(order()).toEqual([
                'filter-1',
                'filter-4',
                'section-a',
                'editor',
                'section-b',
                'filter-2',
            ]);
            // A placeholder whose section is gone lists with the unsectioned rows
            setSidebar({
                isPlaceholder: true,
                editingRule: makeRule({
                    id: 'new',
                    target: { fieldId: '', tableName: '' },
                    sectionId: 'gone',
                }),
                editing: { filterId: 'new' },
            });
            rerender(<ControlSidebar />);
            expect(order().slice(0, 3)).toEqual([
                'filter-1',
                'filter-4',
                'editor',
            ]);
        });

        it('keeps a fieldless new filter rendered when its section collapses', () => {
            const { collapse, discard } = setSidebar({
                isPlaceholder: true,
                editing: { filterId: 'new' },
                editingRule: makeRule({
                    id: 'new',
                    target: { fieldId: '', tableName: '' },
                    sectionId: 'section-a',
                }),
            });
            renderWithProviders(<ControlSidebar />, sectioned());
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            expect(collapse).not.toHaveBeenCalled();
            expect(discard).not.toHaveBeenCalled();
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();
            expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
            // Under its own header, not among the unsectioned rows
            expect(
                screen
                    .getByTestId('fields-and-tiles')
                    .compareDocumentPosition(
                        document.querySelector(
                            '[data-controls-section="section-a"]',
                        ) as Element,
                    ) & Node.DOCUMENT_POSITION_PRECEDING,
            ).toBeTruthy();
        });

        it('folds the expanded filter before collapsing its section', () => {
            const { collapse } = setSidebar({
                isNew: false,
                editing: { filterId: 'filter-3' },
                editingRule: makeRule({
                    id: 'filter-3',
                    label: 'Created',
                    sectionId: 'section-a',
                }),
            });
            const { rerender } = renderWithProviders(
                <ControlSidebar />,
                sectioned(),
            );
            fireEvent.click(
                screen.getByRole('button', {
                    name: 'Collapse section Regions',
                }),
            );
            expect(collapse).not.toHaveBeenCalled();
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            expect(collapse).toHaveBeenCalledTimes(1);
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
            });
            rerender(<ControlSidebar />);
            expect(
                screen.queryByLabelText('Filter label'),
            ).not.toBeInTheDocument();
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();
            expect(
                document.querySelector('[data-controls-section="section-a"]'),
            ).toHaveTextContent(/^Dates1 filter$/);
        });

        it('removing the section of the expanded filter leaves focus on its label', async () => {
            setSidebar({
                isNew: false,
                editing: { filterId: 'filter-3' },
                editingRule: makeRule({
                    id: 'filter-3',
                    label: 'Created',
                    sectionId: 'section-a',
                }),
            });
            renderWithProviders(<ControlSidebar />, sectioned());
            const label = screen.getByLabelText('Filter label');
            expect(label).toHaveFocus();
            fireEvent.click(
                screen.getByRole('button', { name: 'Section Dates actions' }),
            );
            fireEvent.click(
                await screen.findByRole('menuitem', { name: 'Remove section' }),
            );
            fireEvent.click(
                screen.getByRole('menuitem', {
                    name: 'Remove section · 1 filter',
                }),
            );
            expect(label).toBeInTheDocument();
            expect(label).toHaveFocus();
        });

        it('forgets a half-named section and a fold once the rail has closed', async () => {
            closedRail();
            const { rerender } = renderWithProviders(
                <ControlSidebar />,
                sectioned(),
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            await newSection();
            expect(screen.getByLabelText('Section name')).toBeInTheDocument();

            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
                isRailOpen: false,
            });
            rerender(<ControlSidebar />);
            closedRail();
            rerender(<ControlSidebar />);
            expect(
                screen.queryByLabelText('Section name'),
            ).not.toBeInTheDocument();
            expect(
                screen.getByRole('button', { name: /^Created/ }),
            ).toBeVisible();
        });

        it('lets Escape disarm a row remove without reaching the rail', () => {
            closedRail();
            renderWithProviders(<ControlSidebar />, sectioned());
            const remove = screen.getAllByRole('button', {
                name: 'Remove filter',
            })[0];
            expect(remove).toHaveAttribute('data-own-escape');
            fireEvent.click(remove);
            expect(remove).toHaveAttribute('aria-pressed', 'true');
            fireEvent.keyDown(remove, { key: 'Escape' });
            expect(remove).toHaveAttribute('aria-pressed', 'false');
        });

        it('offers no grip while a section is being named', async () => {
            closedRail();
            renderWithProviders(<ControlSidebar />, sectioned());
            expect(grips()).toHaveLength(4);
            await newSection();
            expect(
                screen.queryByRole('button', {
                    name: /^Drag to reorder (?!section)/,
                }),
            ).not.toBeInTheDocument();
        });

        it('drags an expanded filter as a row, and it stays expanded in its new section', async () => {
            setSidebar({
                isNew: false,
                editingRule: makeRule({ label: 'Order status' }),
            });
            const dashboardFilters = filters([
                makeRule({ label: 'Order status' }),
                makeRule({
                    id: 'filter-3',
                    label: 'Created',
                    sectionId: 'section-a',
                }),
            ]);
            const { store } = renderWithProviders(
                <ControlSidebar />,
                dashboardFilters,
            );
            // The drop writes the dashboard draft, as the provider would
            mockDashboardContext.current.setDashboardFilters = (
                update: (f: DashboardFilters) => DashboardFilters,
            ) =>
                store.dispatch(
                    dashboardFiltersActions.setDashboardFilters(
                        typeof update === 'function'
                            ? update(selectDashboardFilters(store.getState()))
                            : update,
                    ),
                );
            // jsdom lays nothing out: stack every element in document order
            // so the keyboard sensor has somewhere to go. The overlay (which
            // dnd-kit collides with) takes the dragged row's place
            const rect = vi
                .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
                .mockImplementation(function (this: HTMLElement) {
                    const isOverlay =
                        this.closest('[class*="dragPreview"]') !== null ||
                        this.querySelector(
                            ':scope > [class*="dragPreview"]',
                        ) !== null;
                    const measured = isOverlay
                        ? (document.querySelector('[data-dragging]') ?? this)
                        : this;
                    const top =
                        [...document.querySelectorAll('*')].indexOf(measured) *
                        10;
                    return {
                        top,
                        bottom: top + 10,
                        left: 0,
                        right: 300,
                        width: 300,
                        height: 10,
                        x: 0,
                        y: top,
                        toJSON: () => ({}),
                    };
                });

            const expanded = screen
                .getByLabelText('Filter label')
                .closest('[data-expanded]');
            expect(expanded).not.toBeNull();
            const grip = within(expanded as HTMLElement).getByRole('button', {
                name: /^Drag to reorder/,
            });
            pickUp(grip);
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            fireEvent.keyDown(grip, { code: 'ArrowDown', key: 'ArrowDown' });
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
            rect.mockRestore();

            await waitFor(() =>
                expect(
                    selectDashboardFilters(store.getState()).dimensions.map(
                        (r) => r.sectionId,
                    ),
                ).toEqual(['section-a', 'section-a']),
            );
            expect(screen.getByLabelText('Filter label')).toBeInTheDocument();
            expect(
                screen.getByLabelText('Filter label').closest('[data-expanded]')
                    ?.className,
            ).toContain('sectionRow');
        });

        // Removal through the store, as the provider writes it
        const removeThroughStore =
            (store: ReturnType<typeof renderWithProviders>['store']) =>
            (ruleId: string) =>
                store.dispatch(
                    dashboardFiltersActions.setDashboardFilters({
                        ...selectDashboardFilters(store.getState()),
                        dimensions: selectDashboardFilters(
                            store.getState(),
                        ).dimensions.filter((rule) => rule.id !== ruleId),
                    }),
                );
        const removeTwice = (ruleId: string) => {
            const remove = within(
                document.querySelector(`[data-controls-row="${ruleId}"]`)
                    ?.parentElement as HTMLElement,
            ).getByRole('button', { name: 'Remove filter' });
            fireEvent.click(remove);
            fireEvent.click(remove);
        };

        it('sends focus to the expanded filter when it is the next row', () => {
            const removeViaStore = vi.fn();
            setSidebar({
                isNew: false,
                editing: { filterId: 'filter-2' },
                editingRule: makeRule({ id: 'filter-2', label: 'Region' }),
                removeFilterById: removeViaStore,
            });
            const { store } = renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ label: 'Order status' }),
                    makeRule({ id: 'filter-2', label: 'Region' }),
                ]),
            );
            removeViaStore.mockImplementation(removeThroughStore(store));

            removeTwice('filter-1');
            expect(
                document.querySelector('[data-controls-row="filter-1"]'),
            ).toBeNull();
            expect(screen.getByLabelText('Filter label')).toHaveFocus();
        });

        it('sends focus to Add when the only other row is in a collapsed section', () => {
            const removeViaStore = vi.fn();
            setSidebar({
                editing: null,
                editingRule: null,
                isSidebarOpen: false,
                removeFilterById: removeViaStore,
            });
            const { store } = renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ label: 'Order status' }),
                    makeRule({
                        id: 'filter-3',
                        label: 'Created',
                        sectionId: 'section-a',
                    }),
                ]),
            );
            removeViaStore.mockImplementation(removeThroughStore(store));
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );

            removeTwice('filter-1');
            expect(screen.getByRole('button', { name: 'Add' })).toHaveFocus();
        });

        it('folds and unfolds a section from its chevron stop with Left and Right', () => {
            closedRail();
            renderWithProviders(<ControlSidebar />, sectioned());
            const chevron = screen.getByRole('button', {
                name: 'Collapse section Dates',
            });
            chevron.focus();
            fireEvent.keyDown(chevron, { key: 'ArrowLeft' });
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();
            const expand = screen.getByRole('button', {
                name: 'Expand section Dates',
            });
            fireEvent.keyDown(expand, { key: 'ArrowRight' });
            expect(
                screen.getByRole('button', { name: /^Created/ }),
            ).toBeVisible();
        });

        it('expands a collapsed section when a drag passes over its header', async () => {
            closedRail();
            const { container, store } = renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ label: 'Order status' }),
                    makeRule({
                        id: 'filter-3',
                        label: 'Created',
                        sectionId: 'section-a',
                    }),
                ]),
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();
            // jsdom lays nothing out: stack every element in document order,
            // the overlay taking the dragged row's place
            const rect = vi
                .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
                .mockImplementation(function (this: HTMLElement) {
                    const isOverlay =
                        this.closest('[class*="dragPreview"]') !== null ||
                        this.querySelector(
                            ':scope > [class*="dragPreview"]',
                        ) !== null;
                    const measured = isOverlay
                        ? (document.querySelector('[data-dragging]') ?? this)
                        : this;
                    const top =
                        [...document.querySelectorAll('*')].indexOf(measured) *
                        10;
                    return {
                        top,
                        bottom: top + 10,
                        left: 0,
                        right: 300,
                        width: 300,
                        height: 10,
                        x: 0,
                        y: top,
                        toJSON: () => ({}),
                    };
                });
            const grip = within(
                container.querySelector('[data-controls-row="filter-1"]')
                    ?.parentElement as HTMLElement,
            ).getByRole('button', { name: /^Drag to reorder/ });
            pickUp(grip);
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            fireEvent.keyDown(grip, { code: 'ArrowDown', key: 'ArrowDown' });
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            expect(
                screen.getByRole('button', { name: /^Created/ }),
            ).toBeInTheDocument();
            // Dropped from the keyboard, focus goes back to the row, not the grip
            mockDashboardContext.current.setDashboardFilters = (
                update: DashboardFilters,
            ) =>
                store.dispatch(
                    dashboardFiltersActions.setDashboardFilters(update),
                );
            fireEvent.keyDown(grip, { code: 'Space', key: ' ' });
            rect.mockRestore();
            await waitFor(() =>
                expect(
                    container.querySelector('[data-controls-row="filter-1"]'),
                ).toHaveFocus(),
            );
        });

        it('keeps a collapsed section collapsed when its own header is picked up', async () => {
            closedRail();
            renderWithProviders(
                <ControlSidebar />,
                filters([
                    makeRule({ label: 'Created', sectionId: 'section-a' }),
                ]),
            );
            fireEvent.click(
                screen.getByRole('button', { name: 'Collapse section Dates' }),
            );
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();

            const grip = screen.getAllByRole('button', {
                name: /^Drag to reorder section/,
            })[0];
            pickUp(grip);
            await act(() => new Promise((resolve) => setTimeout(resolve)));
            expect(
                screen.queryByRole('button', { name: /^Created/ }),
            ).not.toBeInTheDocument();
            expect(
                document.querySelector('[data-controls-section="section-a"]'),
            ).not.toHaveAttribute('data-over');
            fireEvent.keyDown(document, { code: 'Escape', key: 'Escape' });
        });

        it('removes a closed row from its hover action, on the second click only', async () => {
            closedRail();
            const removeFilterById = vi.fn();
            mockSidebar.current = { ...mockSidebar.current, removeFilterById };
            renderWithProviders(<ControlSidebar />, sectioned());

            const removes = screen.getAllByRole('button', {
                name: 'Remove filter',
            });
            expect(removes).toHaveLength(4);
            const row = document.querySelector(
                '[data-controls-row="filter-1"]',
            );
            expect(row?.parentElement).toContainElement(removes[0]);

            // One click arms it; leaving disarms it
            fireEvent.click(removes[0]);
            expect(removes[0]).toHaveAttribute('aria-pressed', 'true');
            fireEvent.blur(removes[0]);
            expect(removes[0]).toHaveAttribute('aria-pressed', 'false');
            expect(removeFilterById).not.toHaveBeenCalled();

            fireEvent.click(removes[0]);
            fireEvent.click(removes[0]);
            // The same call the pill's X makes
            expect(removeFilterById).toHaveBeenCalledWith('filter-1');
            expect(removeFilterById).toHaveBeenCalledTimes(1);
        });

        describe('select mode', () => {
            const selectFromMenu = async () => {
                await userEvent.click(
                    screen.getByRole('button', { name: 'Add' }),
                );
                await userEvent.click(
                    await screen.findByRole('menuitem', {
                        name: 'Select filters',
                    }),
                );
            };
            const row = (name: string) =>
                screen.getByRole('button', { name: new RegExp(`^${name}`) });
            const badge = (text: string) => screen.queryByText(text);
            const selectThree = async () => {
                await selectFromMenu();
                fireEvent.click(row('Order status'));
                fireEvent.click(row('Created'), { shiftKey: true });
                expect(badge('3 selected')).toBeInTheDocument();
            };

            it('enters from the menu: checkboxes, no grips or removes, actions disabled', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                expect(grips()).toHaveLength(4);

                await selectFromMenu();
                expect(badge('0 selected')).toBeInTheDocument();
                expect(screen.getAllByRole('checkbox')).toHaveLength(4);
                expect(
                    screen.queryByRole('button', { name: 'Drag to reorder' }),
                ).not.toBeInTheDocument();
                expect(
                    screen.queryByRole('button', { name: 'Remove filter' }),
                ).not.toBeInTheDocument();
                expect(
                    screen.getByRole('button', { name: 'Move to' }),
                ).toBeDisabled();
                expect(
                    screen.getByRole('button', { name: 'Remove' }),
                ).toBeDisabled();
                expect(
                    screen.queryByRole('button', { name: 'Done' }),
                ).not.toBeInTheDocument();
            });

            it('shows no checkbox at rest: the grip keeps its slot', () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
                expect(grips()).toHaveLength(4);
            });

            it('is disabled while a new filter has no field, with no row checkboxes', async () => {
                setSidebar({ isPlaceholder: true });
                renderWithProviders(<ControlSidebar />, sectioned());
                expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
                await userEvent.click(
                    screen.getByRole('button', { name: 'Add' }),
                );
                expect(
                    await screen.findByRole('menuitem', {
                        name: 'Select filters',
                    }),
                ).toBeDisabled();
            });

            it('folds the expanded filter when the mode starts', async () => {
                const { collapse } = setSidebar({ isNew: false });
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectFromMenu();
                expect(collapse).toHaveBeenCalledTimes(1);
            });

            it('selects a range with shift-click and extends it with shift and an arrow', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectThree();
                expect(
                    screen.getByRole('checkbox', { name: 'Lost' }),
                ).toBeChecked();
                // A plain click toggles, then shift and an arrow select the next
                fireEvent.click(row('Lost'));
                expect(badge('2 selected')).toBeInTheDocument();
                row('Created').focus();
                fireEvent.keyDown(row('Created'), {
                    key: 'ArrowDown',
                    shiftKey: true,
                });
                expect(badge('3 selected')).toBeInTheDocument();
                expect(row('Region')).toHaveFocus();
            });

            it('moves the selection to a section, appended in display order, and leaves the mode', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectThree();
                await userEvent.click(
                    screen.getByRole('button', { name: 'Move to' }),
                );
                const items = await screen.findAllByRole('menuitem');
                expect(items.map((item) => item.textContent)).toEqual([
                    'New section',
                    'Dates · 1',
                    'Regions · 1',
                    'No section',
                ]);
                await userEvent.click(items[2]);

                const setDashboardFilters = mockDashboardContext.current
                    .setDashboardFilters as ReturnType<typeof vi.fn>;
                expect(setDashboardFilters).toHaveBeenCalledTimes(1);
                const written = setDashboardFilters.mock
                    .calls[0][0] as DashboardFilters;
                expect(
                    written.dimensions.map((rule) => [rule.id, rule.sectionId]),
                ).toEqual([
                    ['filter-2', 'section-b'],
                    ['filter-1', 'section-b'],
                    ['filter-4', 'section-b'],
                    ['filter-3', 'section-b'],
                ]);
                expect(
                    mockDashboardContext.current.setHaveFiltersChanged,
                ).toHaveBeenCalledWith(true);
                expect(badge('3 selected')).not.toBeInTheDocument();
                // The footer's menu is gone with the mode: the first moved row
                expect(row('Order status')).toHaveFocus();
            });

            it('names a new section from Move to and moves the selection into it', async () => {
                closedRail();
                const { store } = renderWithProviders(
                    <ControlSidebar />,
                    sectioned(),
                );
                await selectThree();
                await userEvent.click(
                    screen.getByRole('button', { name: 'Move to' }),
                );
                await userEvent.click(
                    await screen.findByRole('menuitem', {
                        name: 'New section',
                    }),
                );
                const input = screen.getByLabelText('Section name');
                expect(input).toHaveFocus();
                // Still selecting until the name is committed
                expect(badge('3 selected')).toBeInTheDocument();
                fireEvent.change(input, { target: { value: 'Fresh' } });
                fireEvent.keyDown(input, { key: 'Enter' });

                const added = selectControlSections(store.getState()).find(
                    (section) => section.name === 'Fresh',
                );
                expect(added).toBeDefined();
                const setDashboardFilters = mockDashboardContext.current
                    .setDashboardFilters as ReturnType<typeof vi.fn>;
                expect(setDashboardFilters).toHaveBeenCalledTimes(1);
                const written = setDashboardFilters.mock
                    .calls[0][0] as DashboardFilters;
                expect(
                    written.dimensions.map((rule) => [rule.id, rule.sectionId]),
                ).toEqual([
                    ['filter-2', 'section-b'],
                    ['filter-1', added?.id],
                    ['filter-4', added?.id],
                    ['filter-3', added?.id],
                ]);
                expect(badge('3 selected')).not.toBeInTheDocument();
            });

            it('keeps the selection where it is when the new section is cancelled', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectThree();
                await userEvent.click(
                    screen.getByRole('button', { name: 'Move to' }),
                );
                await userEvent.click(
                    await screen.findByRole('menuitem', {
                        name: 'New section',
                    }),
                );
                fireEvent.keyDown(screen.getByLabelText('Section name'), {
                    key: 'Escape',
                });
                expect(
                    mockDashboardContext.current.setDashboardFilters,
                ).not.toHaveBeenCalled();
                expect(badge('3 selected')).toBeInTheDocument();
                expect(
                    screen.queryByLabelText('Section name'),
                ).not.toBeInTheDocument();
            });

            it('removes the selection on the second click only, in one write', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectThree();
                const remove = screen.getByRole('button', { name: 'Remove' });
                fireEvent.click(remove);
                const setDashboardFilters = mockDashboardContext.current
                    .setDashboardFilters as ReturnType<typeof vi.fn>;
                expect(setDashboardFilters).not.toHaveBeenCalled();
                fireEvent.click(remove);
                expect(setDashboardFilters).toHaveBeenCalledTimes(1);
                const write = setDashboardFilters.mock.calls[0][0] as (
                    filters: DashboardFilters,
                ) => DashboardFilters;
                expect(
                    write(sectioned()).dimensions.map((rule) => rule.id),
                ).toEqual(['filter-2']);
                expect(badge('3 selected')).not.toBeInTheDocument();
            });

            it('lets Escape disarm the footer Remove without leaving the mode', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectThree();
                const remove = screen.getByRole('button', { name: 'Remove' });
                fireEvent.click(remove);
                expect(remove).toHaveAttribute('aria-pressed', 'true');
                fireEvent.keyDown(remove, { key: 'Escape' });
                expect(remove).toHaveAttribute('aria-pressed', 'false');
                expect(badge('3 selected')).toBeInTheDocument();
            });

            it('keeps the rows and their focus across entering and leaving the mode', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                const created = row('Created');
                await selectFromMenu();
                expect(row('Created')).toBe(created);
                created.focus();
                fireEvent.keyDown(created, { key: 'Escape' });
                expect(badge('0 selected')).not.toBeInTheDocument();
                expect(row('Created')).toBe(created);
                expect(created).toHaveFocus();
            });

            it('leaves the mode from the footer Cancel, clearing the selection', async () => {
                const { close } = closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectFromMenu();
                fireEvent.click(row('Created'));
                expect(badge('1 selected')).toBeInTheDocument();
                fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
                expect(badge('1 selected')).not.toBeInTheDocument();
                expect(close).not.toHaveBeenCalled();
                await selectFromMenu();
                expect(badge('0 selected')).toBeInTheDocument();
            });

            it('says how many hidden rows a collapsed section holds selected', async () => {
                closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectFromMenu();
                fireEvent.click(row('Created'));
                const header = document.querySelector(
                    '[data-controls-section="section-a"]',
                );
                expect(header).not.toHaveTextContent('selected');
                fireEvent.click(
                    screen.getByRole('button', {
                        name: 'Collapse section Dates',
                    }),
                );
                expect(header).toHaveTextContent('1 selected');
                // The header badge and the section header both say it
                expect(screen.getAllByText('1 selected')).toHaveLength(2);
            });

            it('leaves the mode on Escape and on the X without closing the rail', async () => {
                const { close } = closedRail();
                renderWithProviders(<ControlSidebar />, sectioned());
                await selectFromMenu();
                fireEvent.keyDown(row('Created'), { key: 'Escape' });
                expect(badge('0 selected')).not.toBeInTheDocument();

                await selectFromMenu();
                fireEvent.click(
                    screen.getByRole('button', { name: 'Stop selecting' }),
                );
                expect(badge('0 selected')).not.toBeInTheDocument();
                expect(close).not.toHaveBeenCalled();
                expect(grips()).toHaveLength(4);
            });

            it('offers a viewer neither the entry nor the checkboxes', async () => {
                setSidebar({
                    isViewer: true,
                    editing: null,
                    editingRule: null,
                });
                renderWithProviders(
                    <ControlSidebar />,
                    filters([]),
                    filters([makeRule({ label: 'Mine' })]),
                );
                expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
                await userEvent.click(
                    screen.getByRole('button', { name: 'Add' }),
                );
                expect(
                    (await screen.findAllByRole('menuitem')).map(
                        (item) => item.textContent,
                    ),
                ).toEqual(['Add filter']);
            });
        });
    });
});
