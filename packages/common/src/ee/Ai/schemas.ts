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

const filterRuleSchema = z
    .object({
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
    })
    .transform(
        (data): FilterRule => ({
            id: uuid(),
            target: data.target,
            operator: data.rule.operator,
            values: 'values' in data.rule ? data.rule.values : [],
            ...('settings' in data.rule
                ? { settings: data.rule.settings }
                : {}),
        }),
    );

export const filtersSchema = z
    .object({
        type: z.enum(['and', 'or']).describe('Type of filter group operation'),
        dimensions: z.array(filterRuleSchema).nullable(),
        metrics: z.array(filterRuleSchema).nullable(),
    })
    .transform((data): Filters => {
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
        .describe('Maximum number of rows to return from query')
        .nullable(),
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

export const timeSeriesMetricVizConfigSchema = z.object({
    title: z
        .string()
        .describe(
            'The title of the chart. If not provided the chart will have no title.',
        )
        .nullable(),
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
    limit: z
        .number()
        .int()
        .min(1)
        .describe('Maximum number of rows to return from query')
        .nullable(),
    followUpTools: z
        .array(z.string())
        .describe(
            'List of follow-up tools that can be used after this visualization',
        ),
});

export type TimeSeriesMetricVizConfigSchemaType = z.infer<
    typeof timeSeriesMetricVizConfigSchema
>;

const testingFilterRuleSchema = z
    // Notice and is an array of objects with an id, operator, and target
    .array(
        z.object({
            id: z.string(),
            operator: z.string(),
            // Ideally we can use z.pick but it's not a valid method
            //  z.pick(z.union([
            //     booleanFilterSchema.describe('Boolean filter'),
            //     stringFilterSchema.describe('String filter'),
            //     numberFilterSchema.describe('Number filter'),
            //     dateFilterSchema.describe('Date filter'),
            // ]), 'operator'),
            target: z.object({
                fieldId: fieldIdSchema,
                type: FieldTypeSchema,
            }),
        }),
    )
    .nullable()
    // Notice optional is used to make the field optional
    .optional();

const testingFiltersSchema = z.object({
    // Notice dimensions is an object
    dimensions: z.object({
        id: z.string(),
        and: testingFilterRuleSchema,
        or: testingFilterRuleSchema,
    }),

    metrics: z.object({
        id: z.string(),
        and: testingFilterRuleSchema,
        or: testingFilterRuleSchema,
    }),
});

// Outer schema that matches the actual toolArgs structure
export const timeSeriesToolArgsSchema = z.object({
    filters: testingFiltersSchema.nullable(),
    vizConfig: timeSeriesMetricVizConfigSchema,
});

export const generateQueryFiltersToolSchema2 = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    filters: testingFiltersSchema.nullable(),
});

export const verticalBarMetricVizConfigSchema = z.object({
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
    title: z.string().nullable().describe('a descriptive title for the chart'),
    limit: z
        .number()
        .int()
        .min(1)
        .describe('Maximum number of rows to return from query')
        .nullable(),
    followUpTools: z
        .array(z.string())
        .describe(
            'List of follow-up tools that can be used after this visualization',
        ),
});

export type VerticalBarMetricVizConfigSchemaType = z.infer<
    typeof verticalBarMetricVizConfigSchema
>;

// Outer schema that matches the actual toolArgs structure
export const verticalBarToolArgsSchema = z.object({
    filters: testingFiltersSchema.nullable(),
    vizConfig: verticalBarMetricVizConfigSchema,
});

export const csvFileVizConfigSchema = z.object({
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
    limit: z
        .number()
        .int()
        .min(1)
        .describe('Maximum number of rows to return from query')
        .nullable(),
    followUpTools: z
        .array(z.string())
        .describe(
            'List of follow-up tools that can be used after this visualization',
        ),
});

export type CsvFileVizConfigSchemaType = z.infer<typeof csvFileVizConfigSchema>;

// Outer schema that matches the actual toolArgs structure
export const csvToolArgsSchema = z.object({
    filters: testingFiltersSchema.nullable(),
    vizConfig: csvFileVizConfigSchema,
});

// Derived types from schemas
export type FindFieldsToolArgs = z.infer<typeof aiFindFieldsToolSchema>;
export type GenerateQueryFiltersToolArgs = z.infer<
    typeof generateQueryFiltersToolSchema
>;
export type GenerateTimeSeriesVizConfigToolArgs = z.infer<
    typeof timeSeriesToolArgsSchema
>;
export type GenerateBarVizConfigToolArgs = z.infer<
    typeof verticalBarToolArgsSchema
>;
export type GenerateCsvToolArgs = z.infer<typeof csvToolArgsSchema>;

// Tool names enum/union type
export const TOOL_NAMES = [
    'findFields',
    'generateBarVizConfig',
    'generateCsv',
    'generateQueryFilters',
    'generateTimeSeriesVizConfig',
] as const;

export type ToolName = typeof TOOL_NAMES[number];

// Tool display messages
export const TOOL_DISPLAY_MESSAGES = {
    findFields: 'Finding relevant fields',
    generateBarVizConfig: 'Generating a bar chart',
    generateCsv: 'Generating CSV file',
    generateQueryFilters: 'Applying filters to the query',
    generateTimeSeriesVizConfig: 'Generating a line chart',
} as const satisfies Record<ToolName, string>;

export const TOOL_DISPLAY_MESSAGES_AFTER_TOOL_CALL = {
    findFields: 'Found relevant fields',
    generateBarVizConfig: 'Generated a bar chart',
    generateCsv: 'Generated CSV file',
    generateQueryFilters: 'Applied filters to the query',
    generateTimeSeriesVizConfig: 'Generated a line chart',
} as const satisfies Record<ToolName, string>;

// Type guards for tool arguments
export const isFindFieldsToolArgs = (
    toolArgs: unknown,
): toolArgs is FindFieldsToolArgs => {
    try {
        aiFindFieldsToolSchema.parse(toolArgs);
        return true;
    } catch {
        return false;
    }
};

export const isGenerateQueryFiltersToolArgs = (
    toolArgs: unknown,
): toolArgs is GenerateQueryFiltersToolArgs => {
    try {
        generateQueryFiltersToolSchema2.parse(toolArgs);
        return true;
    } catch (error) {
        console.log({ toolArgs });
        console.log('isGenerateQueryFiltersToolArgs error', error);
        return false;
    }
};

export const isGenerateTimeSeriesVizConfigToolArgs = (
    toolArgs: unknown,
): toolArgs is GenerateTimeSeriesVizConfigToolArgs => {
    try {
        timeSeriesToolArgsSchema.parse(toolArgs);
        return true;
    } catch (error) {
        console.log('isGenerateTimeSeriesVizConfigToolArgs error', error);
        return false;
    }
};

export const isGenerateBarVizConfigToolArgs = (
    toolArgs: unknown,
): toolArgs is GenerateBarVizConfigToolArgs => {
    try {
        verticalBarToolArgsSchema.parse(toolArgs);
        return true;
    } catch (error) {
        console.log('isGenerateBarVizConfigToolArgs error', error);
        return false;
    }
};

export const isGenerateCsvToolArgs = (
    toolArgs: unknown,
): toolArgs is GenerateCsvToolArgs => {
    try {
        csvToolArgsSchema.parse(toolArgs);
        return true;
    } catch (error) {
        console.log('isGenerateCsvToolArgs error', error);
        return false;
    }
};

// Typed tool call variant
export type TypedAiAgentToolCall<T extends ToolName = ToolName> = {
    uuid: string;
    promptUuid: string;
    toolCallId: string;
    toolName: T;
    toolArgs: T extends 'findFields'
        ? FindFieldsToolArgs
        : T extends 'generateQueryFilters'
        ? GenerateQueryFiltersToolArgs
        : T extends 'generateTimeSeriesVizConfig'
        ? GenerateTimeSeriesVizConfigToolArgs
        : T extends 'generateBarVizConfig'
        ? GenerateBarVizConfigToolArgs
        : T extends 'generateCsv'
        ? GenerateCsvToolArgs
        : object;
    createdAt: Date;
};
