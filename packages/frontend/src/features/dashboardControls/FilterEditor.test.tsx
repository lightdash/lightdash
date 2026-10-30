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
import { EditorPopover } from './FilterEditor';
import classes from './FilterEditor.module.css';
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

// Both views at once: its own tests switch them
vi.mock('./FilterSettings', () => ({
    FilterSettings: ({
        field,
        nameInput,
        sectionSelect,
        appliedTileCount,
    }: {
        field: { label: string } | null;
        nameInput: ReactNode;
        sectionSelect: ReactNode;
        appliedTileCount: number;
    }) => (
        <div data-testid="filter-settings">
            <div data-controls-value>
                <input aria-label="Operator" />
            </div>
            {field ? `Settings for ${field.label}` : 'Settings with no field'}
            {nameInput}
            {sectionSelect}
            <span data-testid="applied-count">{appliedTileCount}</span>
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
        isMapping: false,
        startMapping: vi.fn(),
        cancelMapping: vi.fn(),
        isAsking: false,
        resolvePending: vi.fn(),
        applyWithUndo: vi.fn(),
        undoApply: vi.fn(),
        fieldUndo: null,
        open: vi.fn(),
        openNew: vi.fn(),
        addFirstField: vi.fn(),
        addFirstSqlColumn: vi.fn(),
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

// The editor as a pill opens it
const Editor = () => (
    <EditorPopover isOpen>
        <button type="button">Pill</button>
    </EditorPopover>
);
const editor = () => document.querySelector('[data-controls-editor]');

describe('EditorPopover', () => {
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

    it('draws nothing at its target the moment it closes, and arrives through its own CSS', () => {
        setSidebar({});
        const { rerender } = renderWithProviders(<Editor />);
        expect(editor()).toHaveClass(classes.dropdown);
        expect(screen.getByRole('dialog')).toBeInTheDocument();

        rerender(
            <EditorPopover isOpen={false}>
                <button type="button">Pill</button>
            </EditorPopover>,
        );
        expect(editor()).toBeNull();
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('hands the settings the tiles the filter is on, over every tab', () => {
        setSidebar({});
        const { rerender } = renderWithProviders(<Editor />);
        expect(screen.getByTestId('applied-count')).toHaveTextContent('2');

        setSidebar({
            editingRule: makeRule({ tileTargets: { a: false, b: REGION } }),
        });
        rerender(<Editor />);
        expect(screen.getByTestId('applied-count')).toHaveTextContent('1');

        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')],
            dashboardTabs: [tab('t1', 0), tab('t2', 1)],
        };
        setSidebar({});
        rerender(<Editor />);
        expect(screen.getByTestId('applied-count')).toHaveTextContent('2');
    });

    it('renders nothing while no filter is edited', () => {
        setSidebar({ editing: null, editingRule: null, isSidebarOpen: false });
        renderWithProviders(<Editor />);
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('is a dialog named by the filter: no header, badge or X', () => {
        setSidebar({
            isNew: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<Editor />);
        expect(
            screen.getByRole('dialog', { name: 'Order status' }),
        ).toBeInTheDocument();
        expect(editor()?.querySelector('.mantine-Badge-root')).toBeNull();
        expect(
            screen.queryByRole('button', { name: 'Remove filter' }),
        ).toBeNull();
        // The provider owns Escape and outside clicks: the pill reads as no open list
        expect(button('Pill')).not.toHaveAttribute('aria-expanded');
    });

    it('ends with Cancel and Apply, the only filled button', () => {
        const { close, discard } = setSidebar({ isNew: false });
        renderWithProviders(<Editor />);

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

    it('opens a new filter on its field search alone, then the value view once a field is picked', () => {
        setSidebar({
            isPlaceholder: true,
            editingRule: placeholder,
        });
        const { rerender } = renderWithProviders(<Editor />);

        expect(
            screen.getByRole('dialog', { name: 'New filter' }),
        ).toBeInTheDocument();
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-settings')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

        const { discard } = setSidebar({
            isPlaceholder: false,
            editingRule: makeRule({}),
        });
        rerender(<Editor />);
        expect(screen.getByTestId('filter-settings')).toBeInTheDocument();
        expect(button('Apply')).toBeEnabled();
        fireEvent.click(button('Cancel'));
        expect(discard).toHaveBeenCalledTimes(1);
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
        renderWithProviders(<Editor />);

        expect(
            screen.getByRole('dialog', { name: 'Order status' }),
        ).toBeInTheDocument();
        expect(button('Apply')).toBeDisabled();
    });

    describe('Apply guards', () => {
        it('disables Apply on a required filter with no value, with the shipped wording', async () => {
            setSidebar({
                isNew: false,
                editingRule: makeRule({
                    required: true,
                    values: [],
                    disabled: true,
                }),
            });
            const { rerender } = renderWithProviders(<Editor />);
            expect(button('Apply')).toBeDisabled();
            await userEvent.hover(button('Apply').parentElement!);
            expect(
                await screen.findByText('Filter field and value required'),
            ).toBeInTheDocument();

            setSidebar({
                isNew: false,
                editingRule: makeRule({ required: true }),
            });
            rerender(<Editor />);
            expect(button('Apply')).toBeEnabled();
        });

        it('disables Apply on a filter that reaches no tile', async () => {
            setSidebar({
                isNew: false,
                editingRule: makeRule({ tileTargets: { a: false, b: false } }),
            });
            renderWithProviders(<Editor />);
            expect(button('Apply')).toBeDisabled();
            await userEvent.hover(button('Apply').parentElement!);
            expect(
                await screen.findByText(
                    'This filter is not applied to any tiles',
                ),
            ).toBeInTheDocument();
        });

        it("never blocks a viewer's own filter", () => {
            setSidebar({
                isViewer: true,
                isNew: false,
                editingRule: makeRule({ tileTargets: { a: false, b: false } }),
            });
            renderWithProviders(<Editor />);
            expect(button('Apply')).toBeEnabled();
        });
    });

    describe('a pill or a click outside with changes unapplied', () => {
        it('asks at the top: Discard or Apply, with the rest dimmed and inert', () => {
            const { resolvePending, close, discard } = setSidebar({
                isNew: false,
                isAsking: true,
            });
            renderWithProviders(<Editor />);

            expect(screen.getByRole('status')).toHaveTextContent(
                'Apply changes to Status first?',
            );
            expect(editor()?.firstElementChild?.firstElementChild).toBe(
                screen.getByRole('status').parentElement,
            );
            const footer = button('Cancel').closest('[inert]');
            expect(footer).toHaveAttribute('data-dimmed');
            expect(footer).not.toHaveAttribute('data-controls-apply');
            // The value, the rows and Settings wait with the footer
            expect(footer).toContainElement(
                screen.getByTestId('filter-settings'),
            );
            // The prompt's Apply takes the marker and the focus
            const asked = editor()?.querySelector('[data-controls-apply]');
            expect(asked).toHaveTextContent('Apply');
            expect(asked).toHaveFocus();
            expect(footer?.contains(asked ?? null)).toBe(false);
            expect(button('Discard')).toHaveAttribute('data-variant', 'subtle');
            expect(asked).toHaveAttribute('data-variant', 'default');

            fireEvent.click(button('Discard'));
            expect(resolvePending).toHaveBeenLastCalledWith(false);
            fireEvent.click(asked as HTMLElement);
            expect(resolvePending).toHaveBeenLastCalledWith(true);
            expect(close).not.toHaveBeenCalled();
            expect(discard).not.toHaveBeenCalled();
        });

        it('focuses Discard when Apply cannot answer', () => {
            setSidebar({
                isNew: false,
                isAsking: true,
                editingRule: makeRule({ tileTargets: { a: false, b: false } }),
            });
            renderWithProviders(<Editor />);
            expect(button('Discard')).toHaveFocus();
        });

        it('has no prompt and a live footer otherwise', () => {
            setSidebar({ isNew: false });
            renderWithProviders(<Editor />);
            expect(screen.queryByRole('status')).not.toBeInTheDocument();
            expect(button('Cancel').closest('[inert]')).toBeNull();
            expect(button('Apply')).toHaveAttribute('data-controls-apply');
        });

        it('cannot Apply from the prompt what Apply could not', () => {
            setSidebar({
                isNew: false,
                isAsking: true,
                editingRule: makeRule({ tileTargets: { a: false, b: false } }),
            });
            renderWithProviders(<Editor />);
            expect(
                editor()?.querySelector('[data-controls-apply]'),
            ).toBeDisabled();
            expect(button('Discard')).toBeEnabled();
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
            renderWithProviders(<Editor />);

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

        it('is not offered without sections', () => {
            setSidebar({});
            renderWithProviders(<Editor />);
            expect(
                screen.queryByRole('combobox', { name: 'Section' }),
            ).not.toBeInTheDocument();
        });
    });

    it('names the open filter after its field while it has no label', () => {
        setSidebar({});
        renderWithProviders(<Editor />);

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
        renderWithProviders(<Editor />);

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
            renderWithProviders(<Editor />);

            expect(screen.getByLabelText('Name')).toHaveAttribute(
                'placeholder',
                'Revenue',
            );
            expect(screen.getByTestId('filter-settings')).toHaveTextContent(
                'Settings for Revenue',
            );
            expect(screen.getByTestId('applied-count')).toHaveTextContent('1');
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
        renderWithProviders(<Editor />);

        expect(screen.getByLabelText('Name')).toHaveAttribute(
            'placeholder',
            'country',
        );
        expect(screen.getByTestId('filter-settings')).toHaveTextContent(
            'Settings with no field',
        );
    });

    it('moves focus to the field search when a new filter opens', async () => {
        setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({ target: { fieldId: '', tableName: '' } }),
        });
        renderWithProviders(<Editor />);

        await waitFor(() =>
            expect(screen.getByLabelText('Search fields')).toHaveFocus(),
        );
    });

    it('keeps focus inside while it is open: Tab from Apply goes around', async () => {
        setSidebar({ isNew: false });
        renderWithProviders(<Editor />);
        act(() => button('Apply').focus());
        await userEvent.tab();
        expect(editor()).toContainElement(
            document.activeElement as HTMLElement,
        );
        expect(document.activeElement).not.toBe(button('Apply'));
    });

    it('stays open on Enter with no label', () => {
        const { close } = setSidebar({});
        renderWithProviders(<Editor />);

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
            renderWithProviders(<Editor />);

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
            renderWithProviders(<Editor />);

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
            renderWithProviders(<Editor />);

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
            const { rerender } = renderWithProviders(<Editor />);

            typeLabel('Status of the order');
            fireEvent.blur(labelInput());
            const typed = vi.mocked(updateFilter).mock.calls[0][0];
            expect(typed.label).toBe('Status of the order');

            setSidebar({ isNew: false, editingRule: typed, updateFilter });
            rerender(<Editor />);
            typeLabel('');
            fireEvent.blur(labelInput());

            const reverted = vi.mocked(updateFilter).mock.calls[1][0];
            expect(reverted).toStrictEqual(saved);
            expect('label' in reverted).toBe(false);
        });

        it('trims the outer spaces of a label when it is written', () => {
            const { updateFilter } = setSidebar({});
            renderWithProviders(<Editor />);

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
            renderWithProviders(<Editor />);

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
            renderWithProviders(<Editor />);

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
            const { rerender } = renderWithProviders(<Editor />);
            typeLabel('Half typed');

            const second = setSidebar({
                isNew: false,
                editing: { filterId: 'filter-2' },
                editingRule: makeRule({ id: 'filter-2', label: 'Region' }),
            });
            rerender(<Editor />);

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
            const { unmount } = renderWithProviders(<Editor />);
            typeLabel('Half typed');

            unmount();
            vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            expect(updateFilter).not.toHaveBeenCalled();
        });
    });

    describe('for a viewer', () => {
        const own = makeRule({ id: 'own', label: undefined });

        it('carries the classes an embed gives the editor and its lists', () => {
            setSidebar({
                isViewer: true,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(
                <RailContractClasses.Provider
                    value={{
                        rail: 'ld-dashboard-filter-rail',
                        addFilterDropdown: 'add-list',
                        filterDropdown: 'ld-dashboard-filter-dropdown',
                    }}
                >
                    <Editor />
                </RailContractClasses.Provider>,
            );
            expect(editor()).toHaveClass('ld-dashboard-filter-rail');
            expect(editor()).toHaveClass('ld-dashboard-filter-dropdown');
        });

        it('edits their own filter in the same editor, with Cancel and Apply', () => {
            const { close, discard } = setSidebar({
                isViewer: true,
                isNew: false,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(<Editor />, filters([]), filters([own]));
            fireEvent.click(button('Apply'));
            expect(close).toHaveBeenCalledTimes(1);
            fireEvent.click(button('Cancel'));
            expect(discard).toHaveBeenCalledTimes(1);
        });

        it('creates a new filter of theirs with Apply', () => {
            setSidebar({
                isViewer: true,
                isNew: true,
                editing: { filterId: 'own' },
                editingRule: own,
            });
            renderWithProviders(<Editor />);
            expect(button('Apply')).toBeEnabled();
        });
    });
});
