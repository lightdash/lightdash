import { z } from 'zod';
import { ConditionalOperator } from '../../types/conditionalRule';
import { UnitOfTime } from '../../types/filter';

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
        z.literal(ConditionalOperator.NULL),
        z.literal(ConditionalOperator.NOT_NULL),
        z.literal(ConditionalOperator.EQUALS),
        z.literal(ConditionalOperator.NOT_EQUALS),
        z.literal(ConditionalOperator.STARTS_WITH),
        z.literal(ConditionalOperator.ENDS_WITH),
        z.literal(ConditionalOperator.INCLUDE),
        z.literal(ConditionalOperator.NOT_INCLUDE),
        z.literal(ConditionalOperator.LESS_THAN),
        z.literal(ConditionalOperator.LESS_THAN_OR_EQUAL),
        z.literal(ConditionalOperator.GREATER_THAN),
        z.literal(ConditionalOperator.GREATER_THAN_OR_EQUAL),
        z.literal(ConditionalOperator.IN_BETWEEN),
    ])
    .describe('Filter operators that can be applied to a filter');

const DateFilterOperatorSchemaReqUnitOfTime = z
    .union([
        z.literal(ConditionalOperator.IN_THE_PAST),
        z.literal(ConditionalOperator.NOT_IN_THE_PAST),
        z.literal(ConditionalOperator.IN_THE_NEXT),
        z.literal(ConditionalOperator.IN_THE_CURRENT),
        z.literal(ConditionalOperator.NOT_IN_THE_CURRENT),
    ])
    .describe(
        'Operators that require a unit of time to be applied on the filter',
    );

const FilterRuleSchemaBase = z
    .object({
        id: z.string().describe('A unique identifier for the filter'),
        target: z
            .object({
                fieldId: FieldIdSchema,
            })
            .describe('Target field to apply the filter'),
        operator: FilterOperatorSchema.describe(
            'Filter operator to apply to the target field',
        ),
        values: z
            .array(z.unknown())
            .describe('Values to apply to the target field using the operator'),
    })
    .describe('Base filter rule schema');

const UnitOfTimeFilterRuleSchema = FilterRuleSchemaBase.merge(
    z.object({
        operator: DateFilterOperatorSchemaReqUnitOfTime.describe(
            'The operator to apply the filter',
        ),
        settings: z.object({
            completed: z
                .boolean()
                .describe("e.g. if it's a completed month or not"),
            unitOfTime: z
                .nativeEnum(UnitOfTime)
                .describe(
                    'the unit of time to apply on the filter, e.g. month, year, etc',
                ),
        }),
    }),
).describe(
    'Specific filter rule schema for filter operators that require unit of time',
);

const FilterRuleSchema = z.union([
    FilterRuleSchemaBase,
    UnitOfTimeFilterRuleSchema,
]);

const AndFilterGroupSchema = z.object({
    id: z.string().describe('A unique identifier for the filter group'),
    and: z
        .array(FilterRuleSchema)
        .describe(
            'List of filters to apply to the query. Filters in AND groups can target both metrics and dimensions',
        ),
});

const OrFilterGroupSchema = z.object({
    id: z.string().describe('A unique identifier for the filter group'),
    or: z
        .array(FilterRuleSchema)
        .describe(
            'List of filters to apply to the query. Filters in OR groups need to target either only metrics or only dimensions',
        ),
});

export const FilterGroupSchema = z.union([
    AndFilterGroupSchema,
    OrFilterGroupSchema,
]);

export const FilterSchema = z.object({
    dimensions: FilterGroupSchema.optional(),
    metrics: FilterGroupSchema.optional(),
});

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
        .optional()
        .default(true)
        .describe(
            '(optional, default true). If true sorts in descending order, if false sorts in ascending order',
        ),
});

// export const CompactOrAliasSchema = z
//     .nativeEnum(Compact)
//     .or(z.enum(CompactAlias));

// export const CustomFormatSchema = z.object({
//     type: z.nativeEnum(CustomFormatType).describe('Type of custom format'),
//     round: z
//         .number()
//         .optional()
//         .describe('Number of decimal places to round to'),
//     separator: z
//         .nativeEnum(NumberSeparator)
//         .optional()
//         .describe('Separator for thousands'),
//     // TODO: this should be enum but currencies is loosely typed
//     currency: z.string().optional().describe('Three-letter currency code'),
//     compact: CompactOrAliasSchema.optional().describe('Compact number format'),
//     prefix: z.string().optional().describe('Prefix to add to the number'),
//     suffix: z.string().optional().describe('Suffix to add to the number'),
// });

// export const TableCalculationSchema = z.object({
//   // TODO: I don't know what this is
//   index: z.number().optional().describe('Index of the table calculation'),
//   name: z.string().min(1).describe('Name of the table calculation'),
//   displayName: z
//       .string()
//       .min(1)
//       .describe('Display name of the table calculation'),
//   sql: z.string().min(1).describe('SQL for the table calculation'),
//   format: CustomFormatSchema.optional().describe(
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
    filters: FilterSchema.describe('Filters to apply to the query'),
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
    //     .optional()
    //     .describe(
    //         'Additional metrics to compute in the explore - not supported yet',
    //     ),
    // TODO: at some point we should have a schema for customDimensions too but it's not needed for now
    // customDimensions: z
    //     .array(z.unknown())
    //     .max(0)
    //     .optional()
    //     .describe('Custom dimensions to group by in the explore'),
    // metadata: z
    //     .object({
    //         // TODO: zod pick type from CompiledDimension
    //         hasADateDimension: z.object({
    //             label: z.string().describe('Label of the date dimension'),
    //             name: z.string().describe('Name of the date dimension'),
    //         }),
    //     })
    //     .optional()
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
