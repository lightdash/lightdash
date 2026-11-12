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
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDashboardTestStore,
    seedDashboardEditState,
    type DashboardEditTestValues,
} from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { renderWithProviders as renderWithAppProviders } from '../../testing/testUtils';
import { FilterBarPopoversProvider } from '../dashboardFilters/FilterRequirements/FilterBarPopoversProvider';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { EditorPopover } from './FilterEditor';
import classes from './FilterEditor.module.css';
import { RailContractClasses } from './railContractClasses';
import { type ControlsSidebarContextValue } from './useControlsSidebar';

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

vi.mock('../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'project-1',
}));
vi.mock('../../hooks/useProject', () => ({
    useProject: () => ({ data: undefined }),
}));

// The popover is real; the shipped value input says what it was handed
vi.mock('../../components/common/Filters/FilterInputs', () => ({
    default: ({
        filterType,
        field: inputField,
    }: {
        filterType: string;
        field?: { label: string };
    }) => (
        <div
            data-testid="value-input"
            data-filter-type={filterType}
            data-field={inputField?.label ?? 'none'}
        >
            <input aria-label="Value" />
        </div>
    ),
}));

vi.mock('./ViewerControls', () => ({
    ViewerControls: ({
        onChangeOthers,
        onEditRules,
    }: {
        onChangeOthers: (rules: DashboardFilterRule[]) => void;
        onEditRules: (() => void) | null;
    }) => (
        <div data-testid="viewer-controls">
            <button
                type="button"
                onClick={() =>
                    onChangeOthers([{ id: 'filter-2' } as DashboardFilterRule])
                }
            >
                change others
            </button>
            {onEditRules !== null && (
                <button type="button" onClick={onEditRules}>
                    edit rules
                </button>
            )}
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
        editorFilters: { dimensions: [], metrics: [], tableCalculations: [] },
        isSidebarOpen: true,
        isMapping: false,
        canChooseTiles: true,
        startMapping: vi.fn(),
        cancelMapping: vi.fn(),
        endMapping: vi.fn(),
        isAsking: false,
        resolvePending: vi.fn(),
        requestSwitch: vi.fn(),
        moveFilter: vi.fn(),
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
const appliesTo = () =>
    screen
        .getByRole('button', { name: /^Applies to/ })
        .getAttribute('aria-label');
const valueInput = () => screen.getByTestId('value-input');
// The name is text; its pencil turns it into an input
const nameInput = () => {
    if (screen.queryByLabelText('Name') === null)
        fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    return screen.getByLabelText('Name');
};

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
        expect(appliesTo()).toBe('Applies to 2 tiles. Choose tiles');

        setSidebar({
            editingRule: makeRule({ tileTargets: { a: false, b: REGION } }),
        });
        rerender(<Editor />);
        expect(appliesTo()).toBe('Applies to 1 of 2 tiles. Choose tiles');

        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')],
            dashboardTabs: [tab('t1', 0), tab('t2', 1)],
        };
        setSidebar({});
        rerender(<Editor />);
        expect(appliesTo()).toBe('Applies to 2 tiles. Choose tiles');
    });

    it('counts out of the tiles that can take a filter, as mapping does', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [
                tile('a', undefined),
                tile('b', undefined),
                {
                    uuid: 'notes',
                    type: DashboardTileTypes.MARKDOWN,
                } as DashboardTile,
            ],
        };
        setSidebar({
            editingRule: makeRule({ tileTargets: { b: false } }),
        });
        renderWithProviders(<Editor />);
        // The markdown tile takes no filter, so it is not one of the total
        expect(appliesTo()).toBe('Applies to 1 of 2 tiles. Choose tiles');
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
        expect(screen.queryByTestId('value-input')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();

        const { discard } = setSidebar({
            isPlaceholder: false,
            editingRule: makeRule({}),
        });
        rerender(<Editor />);
        expect(valueInput()).toBeInTheDocument();
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
        it('lets an editor apply a required filter with no value: viewers set it', () => {
            setSidebar({
                isNew: false,
                editingRule: makeRule({
                    required: true,
                    values: [],
                    disabled: true,
                }),
            });
            renderWithProviders(<Editor />);
            expect(button('Apply')).toBeEnabled();
        });

        it("disables a viewer's Apply on a required filter they cleared, with the shipped wording", async () => {
            setSidebar({
                isViewer: true,
                isNew: false,
                canChooseTiles: false,
                editingRule: makeRule({ required: true, values: [] }),
            });
            const { rerender } = renderWithProviders(<Editor />);
            expect(button('Apply')).toBeDisabled();
            await userEvent.hover(button('Apply').parentElement!);
            expect(
                await screen.findByText('Filter field and value required'),
            ).toBeInTheDocument();

            setSidebar({
                isViewer: true,
                isNew: false,
                canChooseTiles: false,
                editingRule: makeRule({ required: true }),
            });
            rerender(<Editor />);
            expect(button('Apply')).toBeEnabled();
        });

        it('lets a viewer apply a required filter saved with no value they did not touch', () => {
            setSidebar({
                isViewer: true,
                isNew: false,
                canChooseTiles: false,
                editingRule: makeRule({
                    required: true,
                    values: [],
                    disabled: true,
                }),
            });
            renderWithProviders(<Editor />);
            expect(button('Apply')).toBeEnabled();
        });

        it("disables a viewer's Apply on a required group only while no member has a value", () => {
            const a = makeRule({ id: 'filter-a', requiredGroupId: 'g' });
            const b = makeRule({ requiredGroupId: 'g', values: [] });
            setSidebar({
                isViewer: true,
                canChooseTiles: false,
                isNew: false,
                editingRule: b,
                editorFilters: filters([a, b]),
            });
            const { rerender } = renderWithProviders(<Editor />);
            expect(button('Apply')).toBeEnabled();

            setSidebar({
                isViewer: true,
                canChooseTiles: false,
                isNew: false,
                editingRule: b,
                editorFilters: filters([{ ...a, values: [] }, b]),
            });
            rerender(<Editor />);
            expect(button('Apply')).toBeDisabled();
        });

        it("counts no disabled or required member towards a viewer's group", () => {
            const b = makeRule({ requiredGroupId: 'g', values: [] });
            const disabled = makeRule({
                id: 'filter-a',
                requiredGroupId: 'g',
                disabled: true,
                values: ['x'],
            });
            setSidebar({
                isViewer: true,
                canChooseTiles: false,
                isNew: false,
                editingRule: b,
                editorFilters: filters([disabled, b]),
            });
            const { rerender } = renderWithProviders(<Editor />);
            expect(button('Apply')).toBeDisabled();

            const required = makeRule({
                id: 'filter-c',
                requiredGroupId: 'g',
                required: true,
            });
            setSidebar({
                isViewer: true,
                canChooseTiles: false,
                isNew: false,
                editingRule: b,
                editorFilters: filters([required, b]),
            });
            rerender(<Editor />);
            expect(button('Apply')).toBeDisabled();
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

    describe('a pill or Add with changes unapplied', () => {
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
            expect(footer).toContainElement(valueInput());
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

    it('names the open filter after its field while it has no label', () => {
        setSidebar({});
        renderWithProviders(<Editor />);

        expect(
            screen.getByRole('dialog', { name: 'Status' }),
        ).toBeInTheDocument();
        const input = nameInput();
        expect(input).toHaveValue('');
        // As the shipped "Filter label" input
        expect(input).toHaveAttribute('placeholder', 'Label for Status');
        expect(valueInput()).toHaveAttribute('data-field', 'Status');
    });

    it('names a filter whose field is gone "Filter name", with a text value', () => {
        setSidebar({
            editingRule: makeRule({
                target: { fieldId: 'orders_gone', tableName: 'orders' },
            }),
        });
        renderWithProviders(<Editor />);

        expect(
            screen.getByRole('dialog', { name: 'Filter name' }),
        ).toBeInTheDocument();
        expect(nameInput()).toHaveAttribute('placeholder', 'Filter label');
        expect(valueInput()).toHaveAttribute('data-filter-type', 'string');
    });

    it('uses the type a SQL column filter carries', () => {
        setSidebar({
            editingRule: makeRule({
                target: {
                    fieldId: 'ordered_at',
                    tableName: 'sql_chart',
                    isSqlColumn: true,
                    fallbackType: 'date' as never,
                },
            }),
        });
        renderWithProviders(<Editor />);
        expect(valueInput()).toHaveAttribute('data-filter-type', 'date');
    });

    describe('Settings', () => {
        const RulesState = () => (
            <div data-testid="rules-state">
                {useFilterBarPopovers()?.isRulesPopoverOpen ? 'open' : 'closed'}
            </div>
        );

        it('closes the editor, then opens the filter rules of the bar', () => {
            const { close } = setSidebar({ isNew: false });
            renderWithProviders(
                <FilterBarPopoversProvider>
                    <Editor />
                    <RulesState />
                </FilterBarPopoversProvider>,
            );
            fireEvent.click(button('Settings'));
            fireEvent.click(button('edit rules'));
            expect(close).toHaveBeenCalledTimes(1);
            expect(screen.getByTestId('rules-state')).toHaveTextContent('open');
        });

        it('offers no way to the filter rules where the bar cannot be reached', () => {
            setSidebar({ isNew: false });
            renderWithProviders(<Editor />);
            fireEvent.click(button('Settings'));
            expect(
                screen.queryByRole('button', { name: 'edit rules' }),
            ).not.toBeInTheDocument();
        });

        it('writes the other filters Required changes through the sidebar', () => {
            const { updateOtherFilters } = setSidebar({ isNew: false });
            renderWithProviders(<Editor />);
            fireEvent.click(button('Settings'));
            fireEvent.click(button('change others'));
            expect(updateOtherFilters).toHaveBeenCalledWith([
                { id: 'filter-2' },
            ]);
        });
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

            expect(
                screen.getByRole('dialog', { name: 'Revenue' }),
            ).toBeInTheDocument();
            expect(nameInput()).toHaveAttribute(
                'placeholder',
                'Label for Revenue',
            );
            expect(valueInput()).toHaveAttribute('data-field', 'Revenue');
            expect(appliesTo()).toBe('Applies to 1 tile. Choose tiles');
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

        expect(
            screen.getByRole('dialog', { name: 'country' }),
        ).toBeInTheDocument();
        expect(nameInput()).toHaveAttribute('placeholder', 'Filter label');
        expect(valueInput()).toHaveAttribute('data-field', 'none');
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

        fireEvent.keyDown(nameInput(), {
            key: 'Enter',
        });
        expect(close).not.toHaveBeenCalled();
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
                        parameter: 'ld-dashboard-parameter',
                        parameterDropdown: 'ld-dashboard-parameter-dropdown',
                        dateZoom: 'ld-dashboard-date-zoom',
                        dateZoomDropdown: 'ld-dashboard-date-zoom-dropdown',
                    }}
                >
                    <Editor />
                </RailContractClasses.Provider>,
            );
            expect(editor()).toHaveClass('ld-dashboard-filter-rail');
            expect(editor()).toHaveClass('ld-dashboard-filter-dropdown');
        });

        it("carries the embed's list class on the operator menu", async () => {
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
                        parameter: 'ld-dashboard-parameter',
                        parameterDropdown: 'ld-dashboard-parameter-dropdown',
                        dateZoom: 'ld-dashboard-date-zoom',
                        dateZoomDropdown: 'ld-dashboard-date-zoom-dropdown',
                    }}
                >
                    <Editor />
                </RailContractClasses.Provider>,
            );
            await userEvent.click(
                screen.getByRole('button', { name: /^Operator:/ }),
            );
            expect(await screen.findByRole('menu')).toHaveClass(
                'ld-dashboard-filter-dropdown',
            );
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

        it('shows the name as text they cannot edit', () => {
            setSidebar({
                isViewer: true,
                isNew: false,
                editing: { filterId: 'own' },
                editingRule: makeRule({ id: 'own', label: 'Order status' }),
            });
            renderWithProviders(<Editor />);
            expect(
                screen.getByRole('dialog', { name: 'Order status' }),
            ).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Rename' })).toBeNull();
            expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
        });

        it('resets their saved filter to the saved value through the draft', () => {
            const saved = makeRule({ disabled: false });
            mockDashboardContext.current = {
                ...mockDashboardContext.current,
                dashboard: { filters: filters([saved]) },
            };
            const { updateFilter, close } = setSidebar({
                isViewer: true,
                isNew: false,
                canChooseTiles: false,
                editingRule: { ...saved, values: ['other'] },
            });
            renderWithProviders(<Editor />);
            fireEvent.click(button('Reset filter to original value'));
            expect(updateFilter).toHaveBeenCalledWith(
                expect.objectContaining({ values: ['done'] }),
            );
            expect(close).not.toHaveBeenCalled();
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
