import {
    DashboardTileTypes,
    type DashboardFilterRule,
    type DashboardTab,
    type DashboardTile,
} from '@lightdash/common';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../testing/testUtils';
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
    FieldsAndTiles: () => <div data-testid="fields-and-tiles" />,
}));

vi.mock('./ParameterSidebar', () => ({
    ParameterSidebar: () => <div data-testid="parameter-sidebar" />,
}));

vi.mock('./FilterSettings', () => ({
    FilterSettings: ({ field }: { field: { label: string } | null }) => (
        <div data-testid="filter-settings">
            {field ? `Settings for ${field.label}` : 'Settings with no field'}
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
        activeSection: 'fields',
        setActiveSection: vi.fn(),
        open: vi.fn(),
        openNew: vi.fn(),
        addFirstField: vi.fn(),
        addFirstSqlColumn: vi.fn(),
        addFirstFieldOnTile: vi.fn(),
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
        removeFilter: vi.fn(),
        removeFilterById: vi.fn(),
        discard: vi.fn(),
        close: vi.fn(),
        isDirty: true,
        editingControl: null,
        isNewControl: false,
        openControl: vi.fn(),
        addParameterControl: vi.fn(),
        addParameterControlOnTile: vi.fn(),
        updateControl: vi.fn(),
        setControlValue: vi.fn(),
        removeControl: vi.fn(),
        removeControlById: vi.fn(),
        newTileUuids: [],
        dismissedLinks: [],
        dismissLink: vi.fn(),
        ...overrides,
    };
    mockSidebar.current = value;
    return value;
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

    it('summarises the reach of a filter over every tile', () => {
        setSidebar({});
        const { rerender } = renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 2 of 3 tiles'),
        ).toBeInTheDocument();
        expect(screen.queryByText('No mapping yet')).not.toBeInTheDocument();

        setSidebar({
            editingRule: makeRule({ tileTargets: { a: false, b: REGION } }),
        });
        rerender(<ControlSidebar />);
        expect(
            screen.getByText('2 fields · reaches 1 of 3 tiles'),
        ).toBeInTheDocument();
    });

    it('uses the singular for a dashboard with one tile', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', undefined)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 1 of 1 tile'),
        ).toBeInTheDocument();
    });

    it('adds the tabs the filter reaches when the dashboard has several', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't2')],
            dashboardTabs: [tab('t1', 0), tab('t2', 1)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 2 of 3 tiles on 1 of 2 tabs'),
        ).toBeInTheDocument();
    });

    it('leaves the tabs out when the dashboard has a single tab', () => {
        mockDashboardContext.current = {
            ...mockDashboardContext.current,
            dashboardTiles: [tile('a', 't1'), tile('b', 't1'), tile('c', 't1')],
            dashboardTabs: [tab('t1', 0)],
        };
        setSidebar({});
        renderWithProviders(<ControlSidebar />);
        expect(
            screen.getByText('1 field · reaches 2 of 3 tiles'),
        ).toBeInTheDocument();
    });

    it('renders nothing when no control is being edited', () => {
        setSidebar({ editing: null, editingRule: null });
        renderWithProviders(<ControlSidebar />);
        expect(screen.queryByText('Done')).not.toBeInTheDocument();
    });

    it('renders the parameter editor when a parameter control is edited', () => {
        setSidebar({
            editing: null,
            editingRule: null,
            editingControl: {
                id: 'control-1',
                label: 'Region',
                parameterKeys: ['region'],
                tileTargets: {},
            },
        });
        renderWithProviders(<ControlSidebar />);
        expect(screen.getByTestId('parameter-sidebar')).toBeInTheDocument();
        expect(screen.queryByText('Fields and tiles')).not.toBeInTheDocument();
    });

    it('says a placeholder needs a field to be kept', () => {
        const { close } = setSidebar({
            isPlaceholder: true,
            editingRule: makeRule({
                target: { fieldId: '', tableName: '' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByText('New control')).toBeInTheDocument();
        expect(screen.getByText('No mapping yet')).toBeInTheDocument();
        expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
        expect(
            screen.getByText('Add a field to keep this control'),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('button', { name: 'Discard control' }),
        ).toBeInTheDocument();
        fireEvent.keyDown(screen.getByLabelText(/^Label/), { key: 'Enter' });
        expect(close).not.toHaveBeenCalled();
        expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
        expect(screen.queryByLabelText('More actions')).not.toBeInTheDocument();
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
    });

    it('disables Settings for a placeholder and says why', () => {
        setSidebar({
            isPlaceholder: true,
            activeSection: 'settings',
            editingRule: makeRule({
                target: { fieldId: '', tableName: '' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        const settings = screen.getByRole('tab', { name: 'Settings' });
        expect(settings).toHaveAttribute('title', 'Pick a field first');
        expect(settings).toBeDisabled();
        expect(
            screen.getByRole('tab', { name: /^Fields and tiles/ }),
        ).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByTestId('fields-and-tiles')).toBeInTheDocument();
        expect(screen.queryByTestId('filter-settings')).not.toBeInTheDocument();
    });

    it('switches between the two tabs', () => {
        const { setActiveSection } = setSidebar({});
        const { rerender } = renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('tab', { name: 'Fields and tiles (1)' }),
        ).toHaveAttribute('aria-selected', 'true');
        const settings = screen.getByRole('tab', { name: 'Settings' });
        expect(settings).toBeEnabled();
        expect(settings).not.toHaveAttribute('title');
        fireEvent.click(settings);
        expect(setActiveSection).toHaveBeenCalledWith('settings');

        setSidebar({ activeSection: 'settings', setActiveSection });
        rerender(<ControlSidebar />);
        expect(screen.getByTestId('filter-settings')).toBeInTheDocument();
        expect(
            screen.queryByTestId('fields-and-tiles'),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /^Fields and tiles/ }));
        expect(setActiveSection).toHaveBeenCalledWith('fields');
    });

    it('closes with a missing default value and says it stays off', () => {
        const { close } = setSidebar({
            activeSection: 'settings',
            editingRule: makeRule({ label: 'Order status', values: [] }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByText(
                'No default value chosen, so the default stays off',
            ),
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

    it('titles an unlabelled filter with its field and suggests the name', () => {
        const { updateFilter, editingRule } = setSidebar({});
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Status' }),
        ).toBeInTheDocument();
        const input = screen.getByLabelText(/^Filter label/);
        expect(input).not.toBeRequired();
        // The name the bar shows while the label is empty
        expect(input).toHaveAttribute('placeholder', 'Status');
        expect(screen.queryByText(/Add a label/)).not.toBeInTheDocument();
        expect(screen.getByText('Suggestions')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Status' }));
        expect(updateFilter).toHaveBeenCalledWith({
            ...editingRule,
            label: 'Status',
        });
    });

    it('titles an unlabelled existing filter with its field too', () => {
        setSidebar({ isNew: false });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Status' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
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

        it('is titled and suggested by its metric', () => {
            setSidebar({ editingRule: metricRule });
            renderWithProviders(<ControlSidebar />);

            expect(
                screen.getByRole('heading', { name: 'Revenue' }),
            ).toBeInTheDocument();
            expect(screen.getByLabelText(/^Filter label/)).toHaveAttribute(
                'placeholder',
                'Revenue',
            );
            expect(
                screen.getByRole('button', { name: 'Revenue' }),
            ).toBeInTheDocument();
            expect(
                screen.getByText('1 field · reaches 1 of 3 tiles'),
            ).toBeInTheDocument();
        });

        it('hands the metric to its settings', () => {
            setSidebar({ editingRule: metricRule, activeSection: 'settings' });
            renderWithProviders(<ControlSidebar />);

            expect(screen.getByTestId('filter-settings')).toHaveTextContent(
                'Settings for Revenue',
            );
        });
    });

    describe('a SQL column filter', () => {
        const sqlRule = makeRule({
            target: {
                fieldId: 'country',
                tableName: 'sql_chart',
                isSqlColumn: true,
            },
        });

        it('is titled by its column, with nothing to suggest', () => {
            setSidebar({ editingRule: sqlRule });
            renderWithProviders(<ControlSidebar />);

            expect(
                screen.getByRole('heading', { name: 'country' }),
            ).toBeInTheDocument();
            expect(screen.getByLabelText(/^Filter label/)).toHaveAttribute(
                'placeholder',
                'country',
            );
            expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
        });

        it('has settings with no field', () => {
            setSidebar({ editingRule: sqlRule, activeSection: 'settings' });
            renderWithProviders(<ControlSidebar />);

            expect(screen.getByTestId('filter-settings')).toHaveTextContent(
                'Settings with no field',
            );
        });
    });

    it('titles a filter whose field is gone "Filter"', () => {
        setSidebar({
            editingRule: makeRule({
                target: { fieldId: 'orders_gone', tableName: 'orders' },
            }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Filter' }),
        ).toBeInTheDocument();
    });

    it('moves focus to the label when the editor opens', () => {
        setSidebar({});
        renderWithProviders(<ControlSidebar />);

        expect(screen.getByLabelText(/^Filter label/)).toHaveFocus();
    });

    it('stays open on Enter with no label, with no error', () => {
        const { close } = setSidebar({});
        renderWithProviders(<ControlSidebar />);

        fireEvent.keyDown(screen.getByLabelText(/^Filter label/), {
            key: 'Enter',
        });
        expect(screen.queryByText(/Add a label/)).not.toBeInTheDocument();
        expect(close).not.toHaveBeenCalled();
    });

    it('closes a new filter on Done and the X, and stays open on Enter', () => {
        const { close, discard } = setSidebar({
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Order status' }),
        ).toBeInTheDocument();
        expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(screen.getByLabelText(/^Filter label/), {
            key: 'Enter',
        });
        expect(close).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledTimes(2);

        fireEvent.click(
            screen.getByRole('button', { name: 'Discard control' }),
        );
        expect(discard).toHaveBeenCalledTimes(1);
    });

    it('offers Discard changes only once an existing filter has changed', () => {
        const { discard } = setSidebar({
            isNew: false,
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        const { rerender } = renderWithProviders(<ControlSidebar />);
        expect(screen.queryByText('Discard changes')).not.toBeInTheDocument();

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

    describe('label draft', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        const labelInput = () => screen.getByLabelText(/^Filter label/);
        const typeLabel = (value: string) =>
            fireEvent.change(labelInput(), { target: { value } });

        it('reacts to typing at once and writes the label after a pause', () => {
            vi.useFakeTimers();
            const { updateFilter, editingRule } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            typeLabel('Or');
            typeLabel('Order');
            expect(labelInput()).toHaveValue('Order');
            // The editor follows the draft, the dashboard does not
            expect(
                screen.getByRole('heading', { name: 'Order' }),
            ).toBeInTheDocument();
            expect(screen.queryByText('Suggestions')).not.toBeInTheDocument();
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

        it('titles an existing filter with the text being typed', () => {
            setSidebar({
                isNew: false,
                editingRule: makeRule({ label: 'Order status' }),
            });
            renderWithProviders(<ControlSidebar />);

            typeLabel('Status of the order');
            expect(
                screen.getByRole('heading', { name: 'Status of the order' }),
            ).toBeInTheDocument();
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
            expect(screen.queryByText(/Add a label/)).not.toBeInTheDocument();
            expect(
                screen.getByRole('heading', { name: 'Status' }),
            ).toBeInTheDocument();
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

        it('keeps the text in step with a suggestion and drops the pending write', () => {
            vi.useFakeTimers();
            const { updateFilter, editingRule } = setSidebar({});
            renderWithProviders(<ControlSidebar />);

            typeLabel(' ');
            fireEvent.click(screen.getByRole('button', { name: 'Status' }));

            expect(labelInput()).toHaveValue('Status');
            act(() => {
                vi.advanceTimersByTime(LABEL_COMMIT_DELAY * 2);
            });
            expect(updateFilter).toHaveBeenCalledTimes(1);
            expect(updateFilter).toHaveBeenCalledWith({
                ...editingRule,
                label: 'Status',
            });
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

    it('titles an existing filter with its label and removes it on the second click', async () => {
        const { removeFilter } = setSidebar({
            isNew: false,
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Order status' }),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Done' })).toBeEnabled();

        fireEvent.click(screen.getByLabelText('More actions'));
        fireEvent.click(await screen.findByText('Remove filter'));
        expect(removeFilter).not.toHaveBeenCalled();
        fireEvent.click(await screen.findByText('Click again to remove'));
        expect(removeFilter).toHaveBeenCalledTimes(1);
    });
});
