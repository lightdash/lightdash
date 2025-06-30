import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { DimensionType, MetricType } from '../../types/field';
import {
    FilterOperator,
    type FilterRule,
    type Filters,
    UnitOfTime,
} from '../../types/filter';
import assertUnreachable from '../../utils/assertUnreachable';

// TODO: most of the things should live in common and some of the existing types should be inferred from here
// we can't reuse them because there's a bug with TSOA+ZOD - we can't use zod types in TSOA controllers

const DimensionTypeSchema = z.union([
    z.literal(DimensionType.BOOLEAN),
    z.literal(DimensionType.DATE),
    z.literal(DimensionType.NUMBER),
    z.literal(DimensionType.STRING),
    z.literal(DimensionType.TIMESTAMP),
]);

const MetricTypeSchema = z.union([
    z.literal(MetricType.PERCENTILE),
    z.literal(MetricType.AVERAGE),
    z.literal(MetricType.COUNT),
    z.literal(MetricType.COUNT_DISTINCT),
    z.literal(MetricType.SUM),
    z.literal(MetricType.MIN),
    z.literal(MetricType.MAX),
    z.literal(MetricType.NUMBER),
    z.literal(MetricType.MEDIAN),
    z.literal(MetricType.STRING),
    z.literal(MetricType.DATE),
    z.literal(MetricType.TIMESTAMP),
    z.literal(MetricType.BOOLEAN),
]);

const FieldTypeSchema = z.union([DimensionTypeSchema, MetricTypeSchema]);

const fieldIdSchema = z
    .string()
    .min(1)
    .describe(
        `Field ID is a unique identifier of a Metric or a Dimension within a project
ID consists of the table name and field name separated by an underscore.
@example: orders_status, customers_first_name, orders_total_order_amount, etc.`,
    );

const booleanFilterSchema = z.union([
    z.object({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(z.boolean()).length(1),
    }),
]);

const stringFilterSchema = z.union([
    z.object({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
            z.literal(FilterOperator.STARTS_WITH),
            z.literal(FilterOperator.ENDS_WITH),
            z.literal(FilterOperator.INCLUDE),
            z.literal(FilterOperator.NOT_INCLUDE),
        ]),
        values: z.array(z.string()),
    }),
]);

const numberFilterSchema = z.union([
    z.object({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(z.number()),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.LESS_THAN),
            z.literal(FilterOperator.GREATER_THAN),
        ]),
        values: z.array(z.number()).length(1),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.IN_BETWEEN),
            z.literal(FilterOperator.NOT_IN_BETWEEN),
        ]),
        values: z.array(z.number()).length(2),
    }),
]);

const dateOrDateTimeSchema = z.union([
    z.string().date(),
    z.string().datetime(),
]);

const dateFilterSchema = z.union([
    z.object({
        operator: z.union([
            z.literal(FilterOperator.NULL),
            z.literal(FilterOperator.NOT_NULL),
        ]),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.EQUALS),
            z.literal(FilterOperator.NOT_EQUALS),
        ]),
        values: z.array(dateOrDateTimeSchema),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.IN_THE_PAST),
            z.literal(FilterOperator.NOT_IN_THE_PAST),
            z.literal(FilterOperator.IN_THE_NEXT),
            // NOTE: NOT_IN_THE_NEXT is not supported...
        ]),
        values: z.array(z.number()).length(1),
        settings: z.object({
            completed: z.boolean(),
            unitOfTime: z.union([
                z.literal(UnitOfTime.days),
                z.literal(UnitOfTime.weeks),
                z.literal(UnitOfTime.months),
                z.literal(UnitOfTime.quarters),
                z.literal(UnitOfTime.years),
            ]),
        }),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.IN_THE_CURRENT),
            z.literal(FilterOperator.NOT_IN_THE_CURRENT),
        ]),
        values: z.array(z.literal(1)).length(1),
        settings: z.object({
            completed: z.literal(false),
            unitOfTime: z.union([
                z.literal(UnitOfTime.days),
                z.literal(UnitOfTime.weeks),
                z.literal(UnitOfTime.months),
                z.literal(UnitOfTime.quarters),
                z.literal(UnitOfTime.years),
            ]),
        }),
    }),
    z.object({
        operator: z.union([
            z.literal(FilterOperator.LESS_THAN),
            z.literal(FilterOperator.LESS_THAN_OR_EQUAL),
            z.literal(FilterOperator.GREATER_THAN),
            z.literal(FilterOperator.GREATER_THAN_OR_EQUAL),
        ]),
        values: z.array(dateOrDateTimeSchema).length(1),
    }),
    z.object({
        operator: z.literal(FilterOperator.IN_BETWEEN),
        values: z.array(dateOrDateTimeSchema).length(2),
    }),
]);

/**
 * Raw schema for filter rules that are passed to the AI.
 */
const filterRuleSchema = z.object({
    type: z.enum(['or', 'and']).describe('Type of filter group operation'),
    target: z.object({
        fieldId: fieldIdSchema,
        type: FieldTypeSchema,
    }),
    rule: z.union([
        booleanFilterSchema.describe('Boolean filter'),
        stringFilterSchema.describe('String filter'),
        numberFilterSchema.describe('Number filter'),
        dateFilterSchema.describe('Date filter'),
    ]),
});

/**
 * Transformed schema for filter rules that are passed to the query.
 */
const filterRuleSchemaTransformed = filterRuleSchema.transform(
    (data): FilterRule => ({
        id: uuid(),
        target: data.target,
        operator: data.rule.operator,
        values: 'values' in data.rule ? data.rule.values : [],
        ...('settings' in data.rule ? { settings: data.rule.settings } : {}),
    }),
);

/**
 * Raw schema for filters with raw filter rule schema
 */
export const filtersSchema = z.object({
    type: z.enum(['and', 'or']).describe('Type of filter group operation'),
    dimensions: z.array(filterRuleSchema).nullable(),
    metrics: z.array(filterRuleSchema).nullable(),
});

/**
 * Raw filters schema with transformed filter rules.
 */
const filtersSchemaAndFilterRulesTransformed = z
    .object({
        type: z.enum(['and', 'or']).describe('Type of filter group operation'),
        dimensions: z.array(filterRuleSchemaTransformed).nullable(),
        metrics: z.array(filterRuleSchemaTransformed).nullable(),
    })
    // Filters can be null
    .nullable();

/**
 * Final output schema for filters that are passed to the query.
 */
export const filtersSchemaTransformed =
    filtersSchemaAndFilterRulesTransformed.transform((data): Filters => {
        if (!data) {
            return {
                dimensions: { id: uuid(), and: [] },
                metrics: { id: uuid(), and: [] },
            };
        }
        switch (data.type) {
            case 'and':
                return {
                    dimensions: {
                        id: uuid(),
                        and: data.dimensions ?? [],
                    },
                    metrics: {
                        id: uuid(),
                        and: data.metrics ?? [],
                    },
                };
            case 'or':
                return {
                    dimensions: {
                        id: uuid(),
                        or: data.dimensions ?? [],
                    },
                    metrics: {
                        id: uuid(),
                        or: data.metrics ?? [],
                    },
                };
            default:
                return assertUnreachable(data.type, 'Invalid filter type');
        }
    });

export const generateQueryFiltersToolSchema = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    filters: filtersSchema,
});

export const SortFieldSchema = z.object({
    fieldId: fieldIdSchema.describe(
        '"fieldId" must come from the selected Metrics or Dimensions; otherwise, it will throw an error.',
    ),
    descending: z
        .boolean()
        .describe(
            'If true sorts in descending order, if false sorts in ascending order',
        ),
});

export const VisualizationMetadataSchema = z.object({
    title: z.string().describe('A descriptive title for the chart'),
    description: z
        .string()
        .describe('A descriptive summary or explanation for the chart.'),
});
// export const CompactOrAliasSchema = z
//     .nativeEnum(Compact)
//     .or(z.enum(CompactAlias));

// export const CustomFormatSchema = z.object({
//     type: z.nativeEnum(CustomFormatType).describe('Type of custom format'),
//     round: z
//         .number()
//         .nullable()
//         .describe('Number of decimal places to round to'),
//     separator: z
//         .nativeEnum(NumberSeparator)
//         .nullable()
//         .describe('Separator for thousands'),
//     // TODO: this should be enum but currencies is loosely typed
//     currency: z.string().nullable().describe('Three-letter currency code'),
//     compact: CompactOrAliasSchema.nullable().describe('Compact number format'),
//     prefix: z.string().nullable().describe('Prefix to add to the number'),
//     suffix: z.string().nullable().describe('Suffix to add to the number'),
// });

// export const TableCalculationSchema = z.object({
//   // TODO: I don't know what this is
//   index: z.number().nullable().describe('Index of the table calculation'),
//   name: z.string().min(1).describe('Name of the table calculation'),
//   displayName: z
//       .string()
//       .min(1)
//       .describe('Display name of the table calculation'),
//   sql: z.string().min(1).describe('SQL for the table calculation'),
//   format: CustomFormatSchema.nullable().describe(
//       'Format of the table calculation',
//   ),
// });

// TODO: fix me to be a complete schema and infer types from here.
export const lighterMetricQuerySchema = z.object({
    exploreName: z
        .string()
        .describe('Name of the explore to query. @example: "users"'),
    metrics: z
        .array(fieldIdSchema)
        .describe(
            'Metrics (measures) to calculate over the table for this query. @example: ["payments_total_amount", "orders_total_shipping_cost"]',
        ),
    dimensions: z
        .array(fieldIdSchema)
        .describe(
            'Dimensions to break down the metric into groups. @example: ["orders_status", "customers_first_name"]',
        ),
    filters: filtersSchema.describe('Filters to apply to the query'),
    sorts: z
        .array(SortFieldSchema)
        .describe(
            'Sort configuration for the MetricQuery. Should be an empty array if no sorting is needed',
        ),
    limit: z
        .number()
        .int()
        .min(1)
        .describe('Maximum number of rows to return from query'),
    // tableCalculations: z
    //     .array(TableCalculationSchema)
    //     .describe(
    //         'Calculations are freeform SQL expressions that can be used to create new columns in the result set',
    //     ),
    // TODO: at some point we should have a schema for additionalMetrics too but it's not needed for now
    // additionalMetrics: z
    //     .array(z.unknown())
    //     .max(0)
    //     .nullable()
    //     .describe(
    //         'Additional metrics to compute in the explore - not supported yet',
    //     ),
    // TODO: at some point we should have a schema for customDimensions too but it's not needed for now
    // customDimensions: z
    //     .array(z.unknown())
    //     .max(0)
    //     .nullable()
    //     .describe('Custom dimensions to group by in the explore'),
    // metadata: z
    //     .object({
    //         // TODO: zod pick type from CompiledDimension
    //         hasADateDimension: z.object({
    //             label: z.string().describe('Label of the date dimension'),
    //             name: z.string().describe('Name of the date dimension'),
    //         }),
    //     })
    //     .nullable()
    //     .describe('Metadata about the query'),
});

export const lighterMetricQuerySchemaTransformed =
    lighterMetricQuerySchema.transform((data) => ({
        ...data,
        filters: filtersSchemaTransformed.parse(data.filters),
    }));

export const aiAskForAdditionalInformationSchema = z.object({
    message: z
        .string()
        .describe('The message to ask for additional information to the user'),
});

export const aiSummarySchema = z.object({
    message: z.string().describe('Summary message for the user'),
});

export const aiFindFieldsToolSchema = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    embeddingSearchQueries: z
        .array(
            z.object({
                name: z.string().describe('field_id of the field.'),
                description: z.string(),
            }),
        )
        .describe(
            `Break down user input sentence into field names and descriptions to find the most relevant fields in the explore.`,
        ),
});

export const timeSeriesMetricVizConfigSchema =
    VisualizationMetadataSchema.extend({
        exploreName: z
            .string()
            .describe(
                'The name of the explore containing the metrics and dimensions used for the chart.',
            ),
        xDimension: z
            .string()
            .describe(
                'The field id of the time dimension to be displayed on the x-axis.',
            ),
        yMetrics: z
            .array(z.string())
            .min(1)
            .describe(
                'At least one metric is required. The field ids of the metrics to be displayed on the y-axis. If there are multiple metrics there will be one line per metric',
            ),
        sorts: z
            .array(SortFieldSchema)
            .describe(
                'Sort configuration for the query, it can use a combination of metrics and dimensions.',
            ),
        breakdownByDimension: z
            .string()
            .nullable()
            .describe(
                'The field id of the dimension used to split the metrics into series for each dimension value. For example if you wanted to split a metric into multiple series based on City you would use the City dimension field id here. If this is not provided then the metric will be displayed as a single series.',
            ),
        lineType: z
            .union([z.literal('line'), z.literal('area')])
            .describe(
                'default line. The type of line to display. If area then the area under the line will be filled in.',
            ),
    });

export type TimeSeriesMetricVizConfigSchemaType = z.infer<
    typeof timeSeriesMetricVizConfigSchema
>;

export const verticalBarMetricVizConfigSchema =
    VisualizationMetadataSchema.extend({
        exploreName: z
            .string()
            .describe(
                'The name of the explore containing the metrics and dimensions used for the chart.',
            ),
        xDimension: z
            .string()
            .describe(
                'The field id of the dimension to be displayed on the x-axis.',
            ),
        yMetrics: z
            .array(z.string())
            .min(1)
            .describe(
                'At least one metric is required. The field ids of the metrics to be displayed on the y-axis. The height of the bars',
            ),
        sorts: z
            .array(SortFieldSchema)
            .describe(
                'Sort configuration for the query, it can use a combination of metrics and dimensions.',
            ),
        breakdownByDimension: z
            .string()
            .nullable()
            .describe(
                'The field id of the dimension used to split the metrics into groups along the x-axis. If stacking is false then this will create multiple bars around each x value, if stacking is true then this will create multiple bars for each metric stacked on top of each other',
            ),
        stackBars: z
            .boolean()
            .nullable()
            .describe(
                'If using breakdownByDimension then this will stack the bars on top of each other instead of side by side.',
            ),
        xAxisType: z
            .union([z.literal('category'), z.literal('time')])
            .describe(
                'The x-axis type can be categorical for string value or time if the dimension is a date or timestamp.',
            ),
        xAxisLabel: z
            .string()
            .nullable()
            .describe('A helpful label to explain the x-axis'),
        yAxisLabel: z
            .string()
            .nullable()
            .describe('A helpful label to explain the y-axis'),
    });

export type VerticalBarMetricVizConfigSchemaType = z.infer<
    typeof verticalBarMetricVizConfigSchema
>;

export const csvFileVizConfigSchema = VisualizationMetadataSchema.extend({
    exploreName: z
        .string()
        .describe(
            'The name of the explore containing the metrics and dimensions used for csv query',
        ),
    metrics: z
        .array(z.string())
        .min(1)
        .describe(
            'At least one metric is required. The field ids of the metrics to be calculated for the CSV. They will be grouped by the dimensions.',
        ),
    dimensions: z
        .array(z.string())
        .nullable()
        .describe('The field id for the dimensions to group the metrics by'),
    sorts: z
        .array(SortFieldSchema)
        .describe(
            'Sort configuration for the query, it can use a combination of metrics and dimensions.',
        ),
});

export type CsvFileVizConfigSchemaType = z.infer<typeof csvFileVizConfigSchema>;

// TOOL ARGS SCHEMAS

// FIND FIELDS TOOL ARGS
export type FindFieldsToolArgs = z.infer<typeof aiFindFieldsToolSchema>;

export const isFindFieldsToolArgs = (
    toolArgs: unknown,
): toolArgs is FindFieldsToolArgs =>
    aiFindFieldsToolSchema.safeParse(toolArgs).success;

// GENERATE QUERY FILTERS TOOL ARGS
export const generateQueryFiltersToolArgsSchema = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    filters: filtersSchema,
});
export type GenerateQueryFiltersToolArgs = z.infer<
    typeof generateQueryFiltersToolArgsSchema
>;
export const isGenerateQueryFiltersToolArgs = (
    toolArgs: unknown,
): toolArgs is GenerateQueryFiltersToolArgs =>
    generateQueryFiltersToolSchema.safeParse(toolArgs).success;

export const generateQueryFiltersToolArgsSchemaTransformed = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    filters: filtersSchemaTransformed,
});

// GENERATE BAR VIZ CONFIG TOOL ARGS
export const verticalBarMetricVizConfigToolArgsSchema = z.object({
    vizConfig: verticalBarMetricVizConfigSchema,
    filters: filtersSchema,
});
export type VerticalBarMetricVizConfigToolArgs = z.infer<
    typeof verticalBarMetricVizConfigToolArgsSchema
>;
export const isVerticalBarMetricVizConfigToolArgs = (
    toolArgs: unknown,
): toolArgs is VerticalBarMetricVizConfigToolArgs =>
    verticalBarMetricVizConfigToolArgsSchema.safeParse(toolArgs).success;

// -- Used for tool call args transformation
export const verticalBarMetricVizConfigToolArgsSchemaTransformed = z.object({
    vizConfig: verticalBarMetricVizConfigSchema,
    filters: filtersSchemaTransformed,
});

// GENERATE TIME SERIES VIZ CONFIG TOOL ARGS
export const timeSeriesMetricVizConfigToolArgsSchema = z.object({
    vizConfig: timeSeriesMetricVizConfigSchema,
    filters: filtersSchema,
});
export type TimeSeriesMetricVizConfigToolArgs = z.infer<
    typeof timeSeriesMetricVizConfigToolArgsSchema
>;
export const isTimeSeriesMetricVizConfigToolArgs = (
    toolArgs: unknown,
): toolArgs is TimeSeriesMetricVizConfigToolArgs =>
    timeSeriesMetricVizConfigToolArgsSchema.safeParse(toolArgs).success;

// -- Used for tool call args transformation
export const timeSeriesMetricVizConfigToolArgsSchemaTransformed = z.object({
    vizConfig: timeSeriesMetricVizConfigSchema,
    filters: filtersSchemaTransformed,
});

// GENERATE CSV VIZ CONFIG TOOL ARGS
export const CsvFileVizConfigToolArgsSchema = z.object({
    vizConfig: csvFileVizConfigSchema,
    filters: filtersSchema.nullable(),
});
export type CsvFileVizConfigToolArgs = z.infer<
    typeof CsvFileVizConfigToolArgsSchema
>;
export const isCsvFileVizConfigToolArgs = (
    toolArgs: unknown,
): toolArgs is CsvFileVizConfigToolArgs =>
    CsvFileVizConfigToolArgsSchema.safeParse(toolArgs).success;

// -- Used for tool call args transformation
export const CsvFileVizConfigToolArgsSchemaTransformed = z.object({
    vizConfig: csvFileVizConfigSchema,
    filters: filtersSchemaTransformed,
});

// define tool names
export const ToolNameSchema = z.enum([
    'findFields',
    'generateBarVizConfig',
    'generateCsv',
    'generateQueryFilters',
    'generateTimeSeriesVizConfig',
]);

export type ToolName = z.infer<typeof ToolNameSchema>;

export const isToolName = (toolName: string): toolName is ToolName =>
    ToolNameSchema.safeParse(toolName).success;

// display messages schema
export const ToolDisplayMessagesSchema = z.record(ToolNameSchema, z.string());

export const TOOL_DISPLAY_MESSAGES = ToolDisplayMessagesSchema.parse({
    findFields: 'Finding relevant fields',
    generateBarVizConfig: 'Generating a bar chart',
    generateCsv: 'Generating CSV file',
    generateQueryFilters: 'Applying filters to the query',
    generateTimeSeriesVizConfig: 'Generating a line chart',
});

// after-tool-call messages
export const TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL =
    ToolDisplayMessagesSchema.parse({
        findFields: 'Found relevant fields',
        generateBarVizConfig: 'Generated a bar chart',
        generateCsv: 'Generated a table',
        generateQueryFilters: 'Applied filters to the query',
        generateTimeSeriesVizConfig: 'Generated a line chart',
    });
