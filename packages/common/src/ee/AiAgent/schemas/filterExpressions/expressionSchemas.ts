import { z } from 'zod';
import { FilterType } from '../../../../types/filter';
import assertUnreachable from '../../../../utils/assertUnreachable';
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
import { FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE } from './examples';
import {
    filterExpressionDateUnits,
    filterExpressionOperatorDefinitions,
    type FilterExpressionArgumentCount,
    type FilterExpressionOperatorDefinition,
} from './operators';
import {
    FILTER_EXPRESSION_MAX_LENGTH,
    FILTER_EXPRESSION_MAX_LITERAL_LENGTH,
    FILTER_EXPRESSION_MAX_RULES,
    FILTER_EXPRESSION_MAX_VALUES_PER_RULE,
} from './parse';

const connectorInstructionByPolicy = {
    andOnly: 'Join flat rules with AND only. OR is not supported by this tool.',
    andOr: 'Join flat rules with AND or OR. Do not mix both connectors in one expression.',
} satisfies Record<FilterExpressionConnectorPolicy, string>;

export type FilterExpressionConnectorPolicy = 'andOnly' | 'andOr';

const ruleSyntaxByArgumentCount = {
    0: '<operator>',
    1: '<operator>=<value>',
    2: '<operator>=<first value>,<second value>',
    oneOrMore: '<operator>=<value>[,<value>...]',
} satisfies Record<FilterExpressionArgumentCount, string>;

const getOperatorSyntax = (
    definition: FilterExpressionOperatorDefinition,
    argumentCount: FilterExpressionArgumentCount,
): string => {
    switch (definition.argumentSyntax) {
        case 'none':
            return `${definition.operator} [0 values]`;
        case 'relativeDate':
            return `${definition.operator}=<count>{unit:<unit>,completed:<bool>} [1 count; settings required]`;
        case 'currentDate':
            return `${definition.operator}=<unit> [1 unit]`;
        case 'values':
            return `${ruleSyntaxByArgumentCount[argumentCount].replace(
                '<operator>',
                definition.operator,
            )} [${argumentCount === 'oneOrMore' ? '1+ values' : `${argumentCount} ${argumentCount === 1 ? 'value' : 'values'}`}]`;
        default:
            return assertUnreachable(
                definition,
                'Unknown filter expression argument syntax',
            );
    }
};

const getFilterTypeGrammar = (filterType: FilterType): string => {
    const operators = filterExpressionOperatorDefinitions.flatMap(
        (definition) => {
            const argumentCount =
                definition.argumentCountByFilterType[filterType];
            return argumentCount === null
                ? []
                : [`- \`${getOperatorSyntax(definition, argumentCount)}\``];
        },
    );

    const dateGuidance =
        filterType === FilterType.DATE
            ? `\n- Units: ${filterExpressionDateUnits.join(', ')}; completed=false includes partial, true completed only.`
            : '';

    return `### ${filterType}\nGrammar: <field> <operator form>\n${operators.join('\n')}${dateGuidance}`;
};

export const getFilterExpressionGrammarDescription = (
    connectorPolicy: FilterExpressionConnectorPolicy,
): string => `- ${connectorInstructionByPolicy[connectorPolicy]}
- Bare scalars work. Double-quote reserved and whitespace/punctuation strings (apostrophes/parentheses); quote when unsure. Quoted commas/braces literal; backslash escapes. E.g. \`${FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE}\`.
- Limits: ${FILTER_EXPRESSION_MAX_RULES} rules; ${FILTER_EXPRESSION_MAX_VALUES_PER_RULE} values including settings/rule; ${FILTER_EXPRESSION_MAX_LITERAL_LENGTH} characters/literal; ${FILTER_EXPRESSION_MAX_LENGTH} characters/expression.

${Object.values(FilterType).map(getFilterTypeGrammar).join('\n\n')}`;

export const FILTER_EXPRESSION_GRAMMAR_DESCRIPTION =
    getFilterExpressionGrammarDescription('andOr');

export const FILTER_EXPRESSION_AND_ONLY_GRAMMAR_DESCRIPTION =
    getFilterExpressionGrammarDescription('andOnly');

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
        'Separate flat expressions for dimensions, metrics, and table calculations. Each category chooses AND or OR independently. Non-null categories combine implicitly with AND. For example, dimensions "D1 AND D2" and metrics "M1 OR M2" mean "(D1 AND D2) AND (M1 OR M2)", where D1, D2, M1, and M2 are complete filter rules. Use null when a category has no filters.',
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
                code: 'custom',
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
