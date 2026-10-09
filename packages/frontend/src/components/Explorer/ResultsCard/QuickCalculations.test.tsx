import {
    Compact,
    CustomFormatType,
    FieldType,
    Format,
    formatItemValue,
    MetricType,
    NumberSeparator,
    TableCalculationTemplateType,
    type CustomFormat,
    type Metric,
    type ParametersValuesMap,
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
    parameters: {} as ParametersValuesMap,
}));

vi.mock('../../../features/explorer/store', () => ({
    explorerActions: {
        addTableCalculation: (payload: TableCalculation) => ({
            type: 'addTableCalculation',
            payload,
        }),
    },
    selectSorts: () => mocks.sorts,
    selectParameters: () => mocks.parameters,
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
        mocks.parameters = {};
    });

    it('creates a numeric calculation using the percentage shortcut ordering, excluding calculations', () => {
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
                    { fieldId: 'orders_date', order: 'desc' },
                    { fieldId: 'orders_revenue', order: 'asc' },
                ],
                partitionBy: [],
            },
            format: { type: CustomFormatType.NUMBER },
        };
        expect(onCalculationCreated).toHaveBeenCalledWith(calculation);
        expect(mocks.dispatch).toHaveBeenCalledWith({
            type: 'addTableCalculation',
            payload: calculation,
        });
        expect(mocks.track).toHaveBeenCalledOnce();

        fireEvent.click(
            screen.getByRole('menuitem', {
                name: 'Percent change from previous',
            }),
        );
        expect(onCalculationCreated).toHaveBeenLastCalledWith(
            expect.objectContaining({
                template: {
                    ...calculation.template,
                    type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                },
            }),
        );
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

    const formatCases: {
        label: string;
        overrides: Partial<Metric>;
        format: Partial<CustomFormat>;
        value: number;
    }[] = [
        {
            label: 'unformatted numbers',
            overrides: {},
            format: { type: CustomFormatType.NUMBER },
            value: 1.2345,
        },
        {
            label: 'legacy currency with no decimals',
            overrides: { format: Format.USD, round: 0 },
            format: {
                type: CustomFormatType.CURRENCY,
                currency: 'USD',
                round: 0,
            },
            value: 500,
        },
        {
            label: 'four decimal places',
            overrides: { round: 4 },
            format: { type: CustomFormatType.NUMBER, round: 4 },
            value: 1.23456,
        },
        {
            label: 'structured formatting with separators and units',
            overrides: {
                format: Format.USD,
                formatOptions: {
                    type: CustomFormatType.NUMBER,
                    round: 1,
                    separator: NumberSeparator.PERIOD_COMMA,
                    prefix: '+',
                    suffix: ' widgets',
                },
            },
            format: {
                type: CustomFormatType.NUMBER,
                round: 1,
                separator: NumberSeparator.PERIOD_COMMA,
                prefix: '+',
                suffix: ' widgets',
            },
            value: 1234.5,
        },
        {
            label: 'dynamic compact currency',
            overrides: {
                formatOptions: {
                    type: CustomFormatType.CURRENCY,
                    currency: 'GBP',
                    round: 1,
                    compact: Compact.AUTO,
                },
            },
            format: { type: CustomFormatType.CURRENCY, compact: Compact.AUTO },
            value: 12345,
        },
        {
            label: 'percentage inputs',
            overrides: { format: Format.PERCENT, round: 1 },
            format: { type: CustomFormatType.PERCENT, round: 1 },
            value: 0.05,
        },
        {
            label: 'custom expressions with field-level separators',
            overrides: {
                format: '#,##0.0000" kg"',
                separator: NumberSeparator.PERIOD_COMMA,
                formatOptions: { type: CustomFormatType.NUMBER, round: 0 },
            },
            format: {
                type: CustomFormatType.CUSTOM,
                custom: '#,##0.0000" kg"',
                separator: NumberSeparator.PERIOD_COMMA,
            },
            value: 1234.56789,
        },
        {
            label: 'structured custom formats',
            overrides: {
                formatOptions: {
                    type: CustomFormatType.CUSTOM,
                    custom: '0.000" units"',
                },
            },
            format: { type: CustomFormatType.CUSTOM, custom: '0.000" units"' },
            value: 12.3456,
        },
    ];

    it.each(formatCases)('inherits $label', ({ overrides, format, value }) => {
        const item: Metric = { ...metric, ...overrides };
        const onCalculationCreated = renderMenu(item);
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Difference from previous' }),
        );

        const calculation: TableCalculation =
            onCalculationCreated.mock.calls[0][0];
        expect(calculation.format).toMatchObject(format);
        expect(formatItemValue(calculation, value)).toBe(
            formatItemValue(item, value),
        );
    });

    it('copies formatting so subsequent metric changes do not affect the calculation', () => {
        const formatOptions: CustomFormat = {
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
            round: 0,
        };
        const onCalculationCreated = renderMenu({ ...metric, formatOptions });
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Difference from previous' }),
        );

        const calculation: TableCalculation =
            onCalculationCreated.mock.calls[0][0];
        expect(calculation.format).not.toBe(formatOptions);
        formatOptions.currency = 'EUR';
        formatOptions.round = 4;
        expect(calculation.format).toEqual({
            type: CustomFormatType.CURRENCY,
            currency: 'USD',
            round: 0,
        });
        expect(formatItemValue(calculation, 500)).toBe('$500');
    });

    it('resolves parameter-based formats at creation time', () => {
        const item: Metric = {
            ...metric,
            format: '${ld.parameters.currency=="usd"?"$":"€"}#,##0',
        };
        mocks.parameters = { currency: 'usd' };
        const onCalculationCreated = renderMenu(item);
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Difference from previous' }),
        );

        const calculation: TableCalculation =
            onCalculationCreated.mock.calls[0][0];
        expect(calculation.format).toMatchObject({
            type: CustomFormatType.CUSTOM,
            custom: '$#,##0',
        });
        expect(formatItemValue(calculation, 500)).toBe(
            formatItemValue(item, 500, false, mocks.parameters),
        );
        mocks.parameters.currency = 'eur';
        expect(formatItemValue(calculation, 500)).toBe('$500');
    });

    it('uses default formatting when a format parameter cannot be resolved', () => {
        const onCalculationCreated = renderMenu({
            ...metric,
            format: '${ld.parameters.prefix}#,##0',
        });
        fireEvent.click(
            screen.getByRole('menuitem', { name: 'Difference from previous' }),
        );

        expect(onCalculationCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                format: { type: CustomFormatType.DEFAULT },
            }),
        );
    });

    it('preserves percentage shortcut formatting for a currency input', () => {
        const onCalculationCreated = renderMenu({
            ...metric,
            format: Format.USD,
        });
        fireEvent.click(
            screen.getByRole('menuitem', {
                name: 'Percent change from previous',
            }),
        );

        expect(onCalculationCreated).toHaveBeenCalledWith(
            expect.objectContaining({
                format: { type: CustomFormatType.PERCENT, round: 2 },
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
