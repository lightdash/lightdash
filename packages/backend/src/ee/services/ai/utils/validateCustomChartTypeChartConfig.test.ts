import {
    AiAgentValidatorError,
    FilterOperator,
    type DataAppVizSchema,
    type ItemsMap,
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

const numericItem = (type: string) =>
    ({ fieldType: 'metric', type }) as ItemsMap[string];

const selectedFields = {
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_revenue'],
    tableCalculations: ['revenue_running_total'],
    itemsMap: {
        orders_order_date_month: {
            fieldType: 'dimension',
            type: 'date',
        } as ItemsMap[string],
        orders_status: {
            fieldType: 'dimension',
            type: 'string',
        } as ItemsMap[string],
        orders_revenue: numericItem('number'),
        revenue_running_total: numericItem('number'),
    },
};

const buildChartConfig = (
    fieldMapping: ToolRunQueryCustomChartTypeConfig['fieldMapping'],
    options: ToolRunQueryCustomChartTypeConfig['options'] = null,
    fieldOptions: ToolRunQueryCustomChartTypeConfig['fieldOptions'] = null,
    conditionalFormattings: ToolRunQueryCustomChartTypeConfig['conditionalFormattings'] = null,
): ToolRunQueryCustomChartTypeConfig => ({
    customChartTypeSlug: 'cohort-waterfall',
    fieldMapping,
    options,
    fieldOptions,
    conditionalFormattings,
});

const validMapping = {
    x: 'orders_order_date_month',
    y: 'orders_revenue',
};

const multiVizSchema: DataAppVizSchema = {
    ...vizSchema,
    fields: vizSchema.fields.map((field) =>
        field.name === 'y' ? { ...field, multiple: true } : field,
    ),
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
        it('accepts ordered metric and table calculation bindings for a multiple slot', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: ['orders_revenue', 'revenue_running_total'],
                    }),
                    multiVizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('rejects scalar bindings for a multiple slot', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping),
                    multiVizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "y" accepts multiple fields and must be bound to an array.',
                    ),
                }),
            );
        });

        it('rejects array bindings for a single slot', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: ['orders_order_date_month'],
                        y: 'orders_revenue',
                    }),
                    vizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "x" accepts one field and must not be bound to an array.',
                    ),
                }),
            );
        });

        it('rejects duplicate bindings for a multiple slot', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: ['orders_revenue', 'orders_revenue'],
                    }),
                    multiVizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "y" cannot contain duplicate field ids: orders_revenue.',
                    ),
                }),
            );
        });

        it('accepts an empty optional multiple slot but rejects an empty required one', () => {
            const optionalMultiVizSchema: DataAppVizSchema = {
                ...multiVizSchema,
                fields: multiVizSchema.fields.map((field) =>
                    field.name === 'y' ? { ...field, required: false } : field,
                ),
            };
            const config = buildChartConfig({
                x: 'orders_order_date_month',
                y: [],
            });

            expect(() =>
                validateCustomChartTypeChartConfig(
                    config,
                    optionalMultiVizSchema,
                    selectedFields,
                ),
            ).not.toThrow();
            expect(() =>
                validateCustomChartTypeChartConfig(
                    config,
                    multiVizSchema,
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

        it('validates every field in a multiple slot against its declared pool', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: ['orders_revenue', 'orders_status'],
                    }),
                    multiVizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Slot "y" (metric) only accepts metrics or table calculations, but "orders_status" is a dimension.',
                    ),
                }),
            );
        });

        it('rejects every unselected field in a multiple slot', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig({
                        x: 'orders_order_date_month',
                        y: ['orders_revenue', 'customers_count'],
                    }),
                    multiVizSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'fieldMapping references field ids that are not selected in queryConfig: y → customers_count.',
                    ),
                }),
            );
        });

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

    describe('fieldOptions', () => {
        const fieldOptionsSchema: DataAppVizSchema = {
            ...multiVizSchema,
            fields: multiVizSchema.fields.map((field) =>
                field.name === 'y'
                    ? {
                          ...field,
                          configOptions: [
                              {
                                  name: 'color',
                                  label: 'Colour',
                                  type: 'color',
                                  default: '#000000',
                              },
                          ],
                      }
                    : field,
            ),
        };
        const mapping = {
            x: 'orders_order_date_month',
            y: ['orders_revenue', 'revenue_running_total'],
        };

        it('accepts values for fields bound to a slot that declares them', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(mapping, null, {
                        y: {
                            orders_revenue: { color: '#ff0000' },
                            revenue_running_total: { color: '#00ff00' },
                        },
                    }),
                    fieldOptionsSchema,
                    selectedFields,
                ),
            ).not.toThrow();
        });

        it('rejects unbound fields, undeclared slots, unknown options and wrong types', () => {
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(mapping, null, {
                        x: { orders_order_date_month: { color: '#ff0000' } },
                        y: {
                            orders_status: { color: '#ff0000' },
                            orders_revenue: { colour: '#ff0000', color: 1 },
                        },
                    }),
                    fieldOptionsSchema,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringMatching(
                        /Slot "x" declares no per-field options[\s\S]*"orders_status", which is not bound[\s\S]*Unknown per-field option "colour"[\s\S]*y → orders_revenue: Option "color" \(color\) expects a string/,
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

        it('accepts a whole gradient and rejects a malformed one', () => {
            const withGradient: DataAppVizSchema = {
                ...vizSchema,
                configOptions: [
                    {
                        name: 'scale',
                        label: 'Scale',
                        type: 'gradient',
                        default: {
                            colors: ['#000000', '#ffffff'],
                            min: 'auto',
                            max: 'auto',
                        },
                    },
                ],
            };
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, {
                        scale: {
                            colors: ['#000000', '#ff0000', '#ffffff'],
                            min: 0,
                            max: 'auto',
                        },
                    }),
                    withGradient,
                    selectedFields,
                ),
            ).not.toThrow();
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, {
                        scale: {
                            colors: ['#000000', '#ffffff'],
                            min: 20,
                            max: 10,
                        },
                    }),
                    withGradient,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'a fixed min not above a fixed max',
                    ),
                }),
            );
            expect(() =>
                validateCustomChartTypeChartConfig(
                    buildChartConfig(validMapping, { scale: '#000000' }),
                    withGradient,
                    selectedFields,
                ),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Option "scale" (gradient) expects { colors, min, max }',
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

    describe('conditionalFormattings', () => {
        const formattingSchema: DataAppVizSchema = {
            ...multiVizSchema,
            conditionalFormatting: {},
        };
        const mapping = {
            x: 'orders_order_date_month',
            y: ['orders_revenue', 'revenue_running_total'],
            series: 'orders_status',
        };
        const single = (
            fieldId: string,
            compareFieldId: string | null = null,
        ) => ({
            type: 'single' as const,
            fieldId,
            color: '#ff0000',
            conditions: [
                {
                    operator: FilterOperator.GREATER_THAN as const,
                    values: compareFieldId === null ? [10] : null,
                    compareFieldId,
                },
            ],
        });
        const validate = (
            schema: DataAppVizSchema,
            rules: NonNullable<
                ToolRunQueryCustomChartTypeConfig['conditionalFormattings']
            >,
        ) =>
            validateCustomChartTypeChartConfig(
                buildChartConfig(mapping, null, null, rules),
                schema,
                selectedFields,
            );

        it('accepts rules on bound numeric fields, including comparisons', () => {
            expect(() =>
                validate(formattingSchema, [
                    single('orders_revenue', 'revenue_running_total'),
                    {
                        type: 'range',
                        fieldId: 'revenue_running_total',
                        startColor: '#ffffff',
                        endColor: '#0000ff',
                        min: 'auto',
                        max: 100,
                    },
                ]),
            ).not.toThrow();
        });

        it('rejects rules for a type that does not support them', () => {
            expect(() =>
                validate(multiVizSchema, [single('orders_revenue')]),
            ).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'does not support conditional formatting',
                    ),
                }),
            );
        });

        it.each([
            ['an unbound field', single('orders_total')],
            ['a non-numeric field', single('orders_order_date_month')],
            [
                'a comparison with an unbound field',
                single('orders_revenue', 'orders_total'),
            ],
        ])('rejects a rule on %s', (_case, rule) => {
            expect(() => validate(formattingSchema, [rule])).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'must be a numeric field bound in fieldMapping outside a series slot',
                    ),
                }),
            );
        });

        it.each([
            ['a single colour', { ...single('orders_revenue'), color: 'red' }],
            [
                'a range colour',
                {
                    type: 'range' as const,
                    fieldId: 'orders_revenue',
                    startColor: '#ffffff',
                    endColor: 'blue',
                    min: 'auto' as const,
                    max: 'auto' as const,
                },
            ],
        ])('rejects %s that is not hex', (_case, rule) => {
            expect(() => validate(formattingSchema, [rule])).toThrow(
                expect.objectContaining({
                    message: expect.stringContaining('must be a hex colour'),
                }),
            );
        });
    });
});
