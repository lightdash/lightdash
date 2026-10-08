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
        editingRule: makeRule({}),
        isSidebarOpen: true,
        open: vi.fn(),
        updateFilter: vi.fn(),
        removeFilter: vi.fn(),
        removeFilterById: vi.fn(),
        discard: vi.fn(),
        close: vi.fn(),
        isDirty: true,
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

    it('titles an unlabelled existing filter with its field too', () => {
        setSidebar({});
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Status' }),
        ).toBeInTheDocument();
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

        it('is titled by its metric', () => {
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
                screen.getByText('1 field · reaches 1 of 3 tiles'),
            ).toBeInTheDocument();
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

        it('is titled by its column', () => {
            setSidebar({ editingRule: sqlRule });
            renderWithProviders(<ControlSidebar />);

            expect(
                screen.getByRole('heading', { name: 'country' }),
            ).toBeInTheDocument();
            expect(screen.getByLabelText(/^Filter label/)).toHaveAttribute(
                'placeholder',
                'country',
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

    it('closes a filter on Done and the X, and stays open on Enter', () => {
        const { close } = setSidebar({
            editingRule: makeRule({ label: 'Order status' }),
        });
        renderWithProviders(<ControlSidebar />);

        expect(
            screen.getByRole('heading', { name: 'Order status' }),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Done' }));
        expect(close).toHaveBeenCalledTimes(1);

        fireEvent.keyDown(screen.getByLabelText(/^Filter label/), {
            key: 'Enter',
        });
        expect(close).toHaveBeenCalledTimes(1);

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(close).toHaveBeenCalledTimes(2);
    });

    it('offers Discard changes only once an existing filter has changed', () => {
        const { discard } = setSidebar({
            isDirty: false,
            editingRule: makeRule({ label: 'Order status' }),
        });
        const { rerender } = renderWithProviders(<ControlSidebar />);
        expect(screen.queryByText('Discard changes')).not.toBeInTheDocument();

        setSidebar({
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

        it('starts over when another filter is opened, with no late write', () => {
            vi.useFakeTimers();
            const first = setSidebar({});
            const { rerender } = renderWithProviders(<ControlSidebar />);
            typeLabel('Half typed');

            const second = setSidebar({
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
