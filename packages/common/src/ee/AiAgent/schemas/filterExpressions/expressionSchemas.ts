import { z } from 'zod';
import {
    aggregationCustomMetricSchema,
    customMetricsSchema,
    periodComparisonCustomMetricSchema,
} from '../customMetrics';
import {
    formulaTableCalcsSchema,
    tableCalcsSchema,
} from '../tableCalcs/tableCalcs';
import {
    chartConfigBuiltinOnlySchema,
    chartConfigSchema,
    mergeConfigSchema,
    mergeSourceQueryConfigSchema,
    queryConfigBaseSchema,
} from '../tools/toolRunQueryArgs';
import { createToolSchema } from '../toolSchemaBuilder';
import visualizationMetadataSchema from '../visualizationMetadata';
import { filterExpressionOperators } from './operators';
import { FILTER_EXPRESSION_MAX_LENGTH } from './parse';

export const FILTER_EXPRESSION_GRAMMAR_DESCRIPTION = `Filter expressions use the form "field operator=value".

Available operators: ${filterExpressionOperators.join(', ')}.

- Join flat rules with AND or OR. Do not mix both connectors in one expression.
- Quote values containing commas, braces, equals signs, whitespace, parentheses, backslashes, or reserved words with single or double quotes.
- Inside quotes, commas and braces are literal; do not backslash-escape them. Backslash escapes quotes, backslashes, slashes, control characters, and four-digit Unicode sequences.
- Quote unusual field IDs with backticks. AND and OR are reserved field IDs unless quoted.
- Use isNull/notNull without values. equals=null and notEquals=null are equivalent null checks.
- Presence operators take no values. Other operators require one or more comma-separated values according to the field type.
- Relative dates use a count followed by named settings (for example inThePast=30{unit:days,completed:false}). completed=false includes the current partial period; completed=true uses completed periods only.
- Current dates use one unit (for example inTheCurrent=months).
- Nested groups and parentheses are not supported yet.`;

export const filterExpressionInputSchema = z
    .string()
    .min(1)
    .max(FILTER_EXPRESSION_MAX_LENGTH);

export const filterExpressionsSchema = z
    .object({
        dimensions: filterExpressionInputSchema
            .nullable()
            .describe('Flat filter expression for dimension fields.'),
        metrics: filterExpressionInputSchema
            .nullable()
            .describe('Flat filter expression for metric fields.'),
        tableCalculations: filterExpressionInputSchema
            .nullable()
            .describe('Flat filter expression for table calculations.'),
    })
    .strict()
    .describe(
        'Separate flat expressions for dimensions, metrics, and table calculations. Use null when a category has no filters.',
    );

export const aggregationCustomMetricExpressionSchema =
    aggregationCustomMetricSchema.extend({
        filters: filterExpressionInputSchema
            .nullable()
            .describe(
                'Optional flat AND expression for conditional metric filters.',
            ),
    });

export const customMetricExpressionBaseSchema = z.discriminatedUnion('kind', [
    aggregationCustomMetricExpressionSchema,
    periodComparisonCustomMetricSchema,
]);

export const customMetricsExpressionSchema = z
    .array(customMetricExpressionBaseSchema)
    .nullable()
    .describe(customMetricsSchema.description ?? '');

export const queryConfigExpressionSchemaV2 = queryConfigBaseSchema.extend({
    customMetrics: customMetricsExpressionSchema,
    tableCalculations: tableCalcsSchema,
    filters: filterExpressionsSchema.nullable(),
});

export const queryConfigExpressionSchemaV2FormulaOnly =
    queryConfigExpressionSchemaV2.extend({
        tableCalculations: formulaTableCalcsSchema,
    });

export const queryConfigExpressionSchemaV4 =
    queryConfigExpressionSchemaV2FormulaOnly;

export const mergeSourceQueryConfigExpressionSchema =
    queryConfigExpressionSchemaV2
        .omit({
            limit: true,
            parameters: true,
            tableCalculations: true,
        })
        .describe(mergeSourceQueryConfigSchema.description ?? '');

const mergeConfigObjectSchema = mergeConfigSchema.unwrap();

export const mergeConfigExpressionSchema = mergeConfigObjectSchema
    .extend({
        additionalSources: z
            .array(
                z.object({
                    id: z.string().min(1),
                    queryConfig: mergeSourceQueryConfigExpressionSchema,
                }),
            )
            .length(1)
            .describe(
                mergeConfigObjectSchema.shape.additionalSources.description ??
                    '',
            ),
    })
    .nullable()
    .describe(mergeConfigSchema.description ?? '');

export const toolRunQueryExpressionArgsSchemaV2 = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigExpressionSchemaV2,
        chartConfig: chartConfigSchema,
    })
    .build();

export const toolRunQueryExpressionArgsSchemaV2FormulaOnly = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigExpressionSchemaV2FormulaOnly,
        chartConfig: chartConfigSchema,
    })
    .build();

export const toolRunQueryExpressionArgsSchemaV2Mcp =
    toolRunQueryExpressionArgsSchemaV2FormulaOnly.extend({
        chartConfig: chartConfigBuiltinOnlySchema,
    });

export const toolRunQueryExpressionArgsSchema = createToolSchema()
    .extend({
        ...visualizationMetadataSchema.shape,
        queryConfig: queryConfigExpressionSchemaV4,
        chartConfig: chartConfigSchema,
        mergeConfig: mergeConfigExpressionSchema.default(null),
    })
    .build();

export const toolRunQueryExpressionArgsSchemaV2RejectingMerge = z.preprocess(
    (raw, context) => {
        if (
            raw !== null &&
            typeof raw === 'object' &&
            'mergeConfig' in raw &&
            raw.mergeConfig !== null &&
            raw.mergeConfig !== undefined
        ) {
            context.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['mergeConfig'],
                message: 'Merge queries are not enabled for this organization.',
            });
            return z.NEVER;
        }
        return raw;
    },
    toolRunQueryExpressionArgsSchemaV2FormulaOnly,
);

export type ToolRunQueryExpressionArgsV2 = z.infer<
    typeof toolRunQueryExpressionArgsSchemaV2
>;

// These contracts omit mergeConfig on the wire. The optional-never property
// keeps that absence meaningful under TypeScript's structural assignability.
export type ToolRunQueryExpressionArgsPersistedV2 =
    ToolRunQueryExpressionArgsV2 & { mergeConfig?: never };
export type ToolRunQueryExpressionArgsNoMerge = z.infer<
    typeof toolRunQueryExpressionArgsSchemaV2FormulaOnly
> & { mergeConfig?: never };
export type ToolRunQueryExpressionArgsMcp = z.infer<
    typeof toolRunQueryExpressionArgsSchemaV2Mcp
> & { mergeConfig?: never };
export type ToolRunQueryExpressionArgs = z.infer<
    typeof toolRunQueryExpressionArgsSchema
>;

// One provider callback serves both rollout contracts. mergeConfig is present
// only when merge queries are advertised; callers parse the selected contract
// before normalizing no-merge input to mergeConfig: null for resolution.
export type ToolRunQueryExpressionRuntimeArgs = Omit<
    ToolRunQueryExpressionArgs,
    'mergeConfig'
> &
    Partial<Pick<ToolRunQueryExpressionArgs, 'mergeConfig'>>;
