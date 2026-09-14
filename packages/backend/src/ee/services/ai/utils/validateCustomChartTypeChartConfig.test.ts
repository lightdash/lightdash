import {
    AiAgentValidatorError,
    type DataAppVizSchema,
    type ToolRunQueryCustomChartTypeConfig,
} from '@lightdash/common';
import { validateCustomChartTypeChartConfig } from './validators';

const vizSchema: DataAppVizSchema = {
    fields: [
        { name: 'x', label: 'X axis', type: 'dimension', required: true },
        { name: 'y', label: 'Y axis', type: 'metric', required: true },
        { name: 'series', label: 'Series', type: 'series', required: false },
    ],
    configOptions: [
        {
            name: 'showLegend',
            label: 'Show legend',
            type: 'boolean',
            default: true,
        },
        {
            name: 'sortOrder',
            label: 'Sort order',
            type: 'select',
            choices: [
                { value: 'asc', label: 'Ascending' },
                { value: 'desc', label: 'Descending' },
            ],
            default: 'asc',
        },
        {
            name: 'maxBars',
            label: 'Max bars',
            type: 'number',
            default: 10,
            min: 1,
            max: 50,
        },
        {
            name: 'subtitle',
            label: 'Subtitle',
            type: 'text',
            default: '',
        },
        {
            name: 'highlightColor',
            label: 'Highlight color',
            type: 'color',
            default: '#ff0000',
        },
    ],
    colorPalette: null,
};

const selectedFields = {
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_revenue'],
    tableCalculations: ['revenue_running_total'],
};

const buildChartConfig = (
    fieldMapping: Record<string, string>,
    options: ToolRunQueryCustomChartTypeConfig['options'] = null,
): ToolRunQueryCustomChartTypeConfig => ({
    customChartTypeSlug: 'cohort-waterfall',
    fieldMapping,
    options,
});

const validMapping = {
    x: 'orders_order_date_month',
    y: 'orders_revenue',
};

describe('validateCustomChartTypeChartConfig', () => {
    describe('slot binding', () => {
        it('accepts a mapping that binds all required slots to selected fields', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping),
                    vizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('accepts optional slots being bound too', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        ...validMapping,
                        series: 'orders_status',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('rejects unknown slot names, listing the declared slots', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        ...validMapping,
                        nonsense: 'orders_status',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Unknown field slots in fieldMapping: nonsense. This custom chart type declares these slots: x, y, series.',
                    ),
                }),
            );
        });

        it('rejects an unbound required slot', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({ x: 'orders_order_date_month' }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Required field slots not bound in fieldMapping: y.',
                    ),
                }),
            );
        });

        it('rejects field ids that are not selected in the query, listing available fields', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: 'customers_count',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'fieldMapping references field ids that are not selected in queryConfig: y → customers_count. Fields selected in this query: orders_order_date_month, orders_status, orders_revenue, revenue_running_total.',
                    ),
                }),
            );
        });

        it('throws AiAgentValidatorError mentioning the slug and the retry path', () => {
            try {
                validateCustomChartTypeChartConfig(
                    buildChartConfig({}),
                    vizSchema,
                    selectedFields,
                );
                throw new Error('expected validation to throw');
            } catch (e) {
                expect(e).toBeInstanceOf(AiAgentValidatorError);
                const { message } = e as Error;
                expect(message).toContain('cohort-waterfall');
                expect(message).toContain('findCustomChartTypes');
            }
        });
    });

    describe('slot pool matching', () => {
        it('accepts a metric slot bound to a table calculation', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: 'revenue_running_total',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('rejects a dimension slot bound to a metric', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_revenue',
                        y: 'orders_revenue',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "x" (dimension) only accepts dimensions, but "orders_revenue" is a metric. Dimensions selected in this query: orders_order_date_month, orders_status.',
                    ),
                }),
            );
        });

        it('rejects a series slot bound to a metric', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        ...validMapping,
                        series: 'orders_revenue',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "series" (series) only accepts dimensions, but "orders_revenue" is a metric. Dimensions selected in this query: orders_order_date_month, orders_status.',
                    ),
                }),
            );
        });

        it('rejects a dimension slot bound to a table calculation', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'revenue_running_total',
                        y: 'orders_revenue',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "x" (dimension) only accepts dimensions, but "revenue_running_total" is a table calculation.',
                    ),
                }),
            );
        });

        it('rejects a metric slot bound to a dimension', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: 'orders_status',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "y" (metric) only accepts metrics or table calculations, but "orders_status" is a dimension. Metrics and table calculations selected in this query: orders_revenue, revenue_running_total.',
                    ),
                }),
            );
        });
    });

    describe('options', () => {
        it('accepts null options', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, null),
                    vizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('accepts valid values for every declared option type', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, {
                        showLegend: false,
                        sortOrder: 'desc',
                        maxBars: 25,
                        subtitle: 'Monthly revenue',
                        highlightColor: '#00ff00',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('rejects an unknown option name, listing the declared options', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { legendShown: true }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Unknown option "legendShown". This custom chart type declares these options: showLegend, sortOrder, maxBars, subtitle, highlightColor.',
                    ),
                }),
            );
        });

        it('rejects any option when the type declares none', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { showLegend: true }),
                    { ...vizSchema, configOptions: [] },
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Unknown option "showLegend". This custom chart type declares no options.',
                    ),
                }),
            );
        });

        it('rejects a non-boolean value for a boolean option', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { showLegend: 'yes' }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "showLegend" (boolean) expects true or false, received "yes".',
                    ),
                }),
            );
        });

        it('rejects a select value outside the declared choices, listing them', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { sortOrder: 'up' }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "sortOrder" (select) must be one of: asc, desc. Received "up".',
                    ),
                }),
            );
        });

        it('rejects a non-number value for a number option', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { maxBars: 'ten' }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "maxBars" (number) expects a number, received "ten".',
                    ),
                }),
            );
        });

        it('rejects a number below the declared minimum', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { maxBars: 0 }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "maxBars" (number) must be >= 1, received 0.',
                    ),
                }),
            );
        });

        it('rejects a number above the declared maximum', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { maxBars: 100 }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "maxBars" (number) must be <= 50, received 100.',
                    ),
                }),
            );
        });

        it('rejects a non-string value for a text option', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { subtitle: 42 }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "subtitle" (text) expects a string, received 42.',
                    ),
                }),
            );
        });

        it('rejects a non-string value for a color option', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { highlightColor: true }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "highlightColor" (color) expects a string, received true.',
                    ),
                }),
            );
        });

        it('collects field-mapping and option errors into one message', () => {
            try {
                validateCustomChartTypeChartConfig(
                    buildChartConfig(
                        { x: 'orders_revenue', y: 'orders_revenue' },
                        { maxBars: 100 },
                    ),
                    vizSchema,
                    selectedFields,
                );
                throw new Error('expected validation to throw');
            } catch (e) {
                expect(e).toBeInstanceOf(AiAgentValidatorError);
                const { message } = e as Error;
                expect(message).toContain('Slot "x" (dimension)');
                expect(message).toContain('Option "maxBars" (number)');
            }
        });
    });
});
