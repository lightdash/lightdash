import { z } from 'zod';
import { DimensionType, MetricType } from '../../types/field';
import { FilterOperator, UnitOfTime } from '../../types/filter';
import assertUnreachable from '../../utils/assertUnreachable';

// TODO: most of the things should live in common and some of the existing types should be inferred from here
// we can't reuse them because there's a bug with TSOA+ZOD - we can't use zod types in TSOA controllers

export const FieldIdSchema = z
    .string()
    .min(1)
    .describe(
        `Field ID is a unique identifier of a Metric or a Dimension within a project
ID consists of the table name and field name separated by an underscore.
@example: orders_status, customers_first_name, orders_total_order_amount, etc.`,
    );

// All the operators that can be applied to a filter, now we have a validator
const FilterOperatorSchema = z
    .union([
        z.literal(FilterOperator.NULL),
        z.literal(FilterOperator.NOT_NULL),
        z.literal(FilterOperator.EQUALS),
        z.literal(FilterOperator.NOT_EQUALS),
        z.literal(FilterOperator.STARTS_WITH),
        z.literal(FilterOperator.ENDS_WITH),
        z.literal(FilterOperator.INCLUDE),
        z.literal(FilterOperator.NOT_INCLUDE),
        z.literal(FilterOperator.LESS_THAN),
        z.literal(FilterOperator.LESS_THAN_OR_EQUAL),
        z.literal(FilterOperator.GREATER_THAN),
        z.literal(FilterOperator.GREATER_THAN_OR_EQUAL),
        z.literal(FilterOperator.IN_BETWEEN),
    ])
    .describe('Filter operators that can be applied to a filter');

const DateFilterOperatorSchemaReqUnitOfTime = z
    .union([
        z.literal(FilterOperator.IN_THE_PAST),
        z.literal(FilterOperator.NOT_IN_THE_PAST),
        z.literal(FilterOperator.IN_THE_NEXT),
        z.literal(FilterOperator.IN_THE_CURRENT),
        z.literal(FilterOperator.NOT_IN_THE_CURRENT),
    ])
    .describe(
        'Operators that require a unit of time to be applied on the filter',
    );

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

const FilterRuleSchema = z
    .object({
        id: z.string().describe('A unique identifier for the filter'),
        target: z
            .object({
                fieldId: FieldIdSchema,
                type: FieldTypeSchema.describe('Type of the field'),
            })
            .describe('Target field to apply the filter'),
        operator: z
            .union([
                FilterOperatorSchema,
                DateFilterOperatorSchemaReqUnitOfTime,
            ])
            .describe('Filter operator to apply to the target field'),
        values: z
            .array(
                z.union([
                    z.null(),
                    z.boolean(),
                    z.string().describe('Use strings for date filters'),
                    z.number().describe('Do not use numbers for date filters'),
                ]),
            )
            .describe(
                'Use the provided values with the specified operator on the target field. If the target field type is timestamp or date, ensure values are JavaScript Date-compatible strings.',
            ),
        settings: z
            .object({
                completed: z
                    .boolean()
                    .describe("e.g. if it's a completed month or not"),
                unitOfTime: z
                    .nativeEnum(UnitOfTime)
                    .describe(
                        'the unit of time to apply on the filter, e.g. month, year, etc',
                    ),
            })
            .nullable()
            .describe(
                'Settings for time-based filters, null for non-time filters',
            ),
    })
    .transform((data) => {
        if (data.settings !== null) {
            return {
                id: data.id,
                target: data.target,
                operator: data.operator,
                values: data.values,
                settings: data.settings,
            };
        }

        return {
            id: data.id,
            target: data.target,
            operator: data.operator,
            values: data.values,
        };
    });

export type FilterRuleSchemaType = z.infer<typeof FilterRuleSchema>;

export const FilterGroupSchema = z
    .object({
        id: z.string().describe('A unique identifier for the filter group'),
        type: z.enum(['and', 'or']).describe('Type of filter group operation'),
        rule: z
            .array(FilterRuleSchema)
            .describe(
                'List of filters to apply. Filters in groups can target both metrics and dimensions',
            ),
    })
    .transform((data) => {
        switch (data.type) {
            case 'and':
                return { id: data.id, and: data.rule };
            case 'or':
                return { id: data.id, or: data.rule };
            default:
                return assertUnreachable(
                    data.type,
                    'invalid FilterGroupSchema type',
                );
        }
    });

export type FilterGroupSchemaType = z.infer<typeof FilterGroupSchema>;

// TODO: This schema was designed to closely match the existing filter types,
// but LLM providers require that all fields be explicitly defined and present.
// https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses#all-fields-must-be-required
export const filterSchema = z.object({
    dimensions: FilterGroupSchema.nullable(),
    metrics: FilterGroupSchema.nullable(),
});

export type FilterSchemaType = z.infer<typeof filterSchema>;

export const GenerateQueryFiltersToolSchema = z.object({
    exploreName: z.string().describe('Name of the selected explore'),
    filterGroup: FilterGroupSchema.describe(
        'Filters to apply to the query. Filtered fields must exist in the selected explore.',
    ),
});

export const SortFieldSchema = z.object({
    fieldId: FieldIdSchema.describe(
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
        .array(FieldIdSchema)
        .describe(
            'Metrics (measures) to calculate over the table for this query. @example: ["payments_total_amount", "orders_total_shipping_cost"]',
        ),
    dimensions: z
        .array(FieldIdSchema)
        .describe(
            'Dimensions to break down the metric into groups. @example: ["orders_status", "customers_first_name"]',
        ),
    filters: filterSchema.describe('Filters to apply to the query'),
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
});

export type TimeSeriesMetricVizConfigSchemaType = z.infer<
    typeof timeSeriesMetricVizConfigSchema
>;

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
});

export type VerticalBarMetricVizConfigSchemaType = z.infer<
    typeof verticalBarMetricVizConfigSchema
>;

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
});

export type CsvFileVizConfigSchemaType = z.infer<typeof csvFileVizConfigSchema>;
