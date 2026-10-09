import {
    CustomFormatType,
    FieldType,
    MetricType,
    TableCalculationTemplateType,
    type Metric,
    type SortField,
    type TableCalculation,
} from '@lightdash/common';
import { Button, MantineProvider, Menu } from '@mantine/core';
import { fireEvent, render, screen } from '@testing-library/react';
import QuickCalculationMenuOptions from './QuickCalculations';

const mocks = vi.hoisted(() => ({
    dispatch: vi.fn(),
    track: vi.fn(),
    sorts: [] as SortField[],
    tableCalculations: [] as TableCalculation[],
}));

vi.mock('../../../features/explorer/store', () => ({
    explorerActions: {
        addTableCalculation: (payload: TableCalculation) => ({
            type: 'addTableCalculation',
            payload,
        }),
    },
    selectSorts: () => mocks.sorts,
    selectTableCalculations: () => mocks.tableCalculations,
    useExplorerDispatch: () => mocks.dispatch,
    useExplorerSelector: (selector: () => unknown) => selector(),
}));

vi.mock('../../../providers/Tracking/useTracking', () => ({
    default: () => ({ track: mocks.track }),
}));

const metric: Metric = {
    fieldType: FieldType.METRIC,
    type: MetricType.SUM,
    name: 'revenue',
    label: 'Revenue',
    table: 'orders',
    tableLabel: 'Orders',
    sql: '${TABLE}.revenue',
    hidden: false,
};

const renderMenu = (item = metric) => {
    const onCalculationCreated = vi.fn();
    render(
        <MantineProvider env="test">
            <Menu opened>
                <Menu.Target>
                    <Button>Quick calculations</Button>
                </Menu.Target>
                <Menu.Dropdown>
                    <QuickCalculationMenuOptions
                        item={item}
                        onCalculationCreated={onCalculationCreated}
                    />
                </Menu.Dropdown>
            </Menu>
        </MantineProvider>,
    );
    return onCalculationCreated;
};

describe('Difference from previous quick calculation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sorts = [];
        mocks.tableCalculations = [];
    });

    it('creates a numeric calculation using the current sorts, excluding calculations', () => {
        mocks.sorts = [
            { fieldId: 'orders_date', descending: false },
            { fieldId: 'orders_revenue', descending: true },
            { fieldId: 'existing_calc', descending: false },
        ];
        mocks.tableCalculations = [
            {
                name: 'existing_calc',
                displayName: 'Existing calculation',
                sql: '1',
            },
        ];
        const onCalculationCreated = renderMenu();

        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Difference from previous' }),
        );

        const calculation: TableCalculation = {
            name: 'difference_from_previous_of_revenue',
            displayName: 'Difference from previous of Revenue',
            template: {
                type: TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS,
                fieldId: 'orders_revenue',
                orderBy: [
                    { fieldId: 'orders_date', order: 'asc' },
                    { fieldId: 'orders_revenue', order: 'desc' },
                ],
                partitionBy: [],
            },
            format: { type: CustomFormatType.NUMBER, round: 2 },
        };
        expect(onCalculationCreated).toHaveBeenCalledWith(calculation);
        expect(mocks.dispatch).toHaveBeenCalledWith({
            type: 'addTableCalculation',
            payload: calculation,
        });
        expect(mocks.track).toHaveBeenCalledOnce();
    });

    it('creates a calculation when there are no sorts', () => {
        const onCalculationCreated = renderMenu();
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Difference from previous' }),
        );

        expect(onCalculationCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                template: {
                    type: TableCalculationTemplateType.DIFFERENCE_FROM_PREVIOUS,
                    fieldId: 'orders_revenue',
                    orderBy: [],
                    partitionBy: [],
                },
            }),
        );
    });

    it.each([MetricType.DATE, MetricType.STRING, MetricType.MIN])(
        'does not offer numeric differences for %s metrics',
        (type) => {
            renderMenu({ ...metric, type });
            expect(
                screen.queryByRole('menuitem', {
                    name: 'Difference from previous',
                }),
            ).not.toBeInTheDocument();
        },
    );
});
