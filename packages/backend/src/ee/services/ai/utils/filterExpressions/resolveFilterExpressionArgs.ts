import {
    assertUnreachable,
    convertAdditionalMetric,
    convertAiTableCalcsSchemaToTableCalcs,
    customMetricsSchemaTransformed,
    DimensionType,
    filterAggregationCustomMetrics,
    filterExpressionOperatorDefinitions,
    FilterOperator,
    filterRuleSchema,
    FilterType,
    getFields,
    getFilterTypeFromItemType,
    getItemId,
    isDimension,
    isFilterExpressionRelativeDateOperator,
    parseFilterExpression,
    TableCalculationType,
    toolRunQueryExpressionResolvedArgsSchema,
    toolRunQueryExpressionResolvedArgsSchemaTransformed,
    UnitOfTime,
    type Explore,
    type FilterExpressionArgumentCount,
    type FilterExpressionAst,
    type FilterExpressionParseError,
    type FilterExpressionSpan,
    type ToolRunQueryArgsTransformed,
    type ToolRunQueryExpressionArgs,
    type ToolRunQueryExpressionResolvedArgs,
} from '@lightdash/common';
import { z } from 'zod';
import { populateCustomMetricsSQL } from '../populateCustomMetricsSQL';
import { suggestClosestFieldIds } from '../suggestClosestFieldIds';
import type {
    FilterExpressionResolutionError,
    FilterExpressionSource,
    QueryFilterExpressionCategory,
} from './errors';

type ExpressionToolArgs = ToolRunQueryExpressionArgs;

type FilterExpressionRule = FilterExpressionAst['rules'][number];
type FilterExpressionScalar = FilterExpressionRule['arguments'][number];

type ExpressionQueryConfig = {
    exploreName: string;
    customMetrics: ToolRunQueryExpressionArgs['queryConfig']['customMetrics'];
    filters: ToolRunQueryExpressionArgs['queryConfig']['filters'];
    tableCalculations?: ToolRunQueryExpressionArgs['queryConfig']['tableCalculations'];
};

type ResolutionResult<T> =
    | { success: true; data: T }
    | { success: false; error: FilterExpressionResolutionError };

type RawFilterValue = string | number | boolean;

type RawFilterRule = {
    fieldId: string;
    fieldType: ResolvedField['fieldType'];
    fieldFilterType: FilterType;
    operator: FilterOperator;
    values?: RawFilterValue[];
    settings?: {
        completed: boolean;
        unitOfTime: UnitOfTime;
    };
};

type ResolvedField = {
    id: string;
    table: string | null;
    fieldType: Parameters<typeof getFilterTypeFromItemType>[0];
    filterType: FilterType;
    category: QueryFilterExpressionCategory;
};

type ResolvedQueryConfigParts = {
    customMetrics: unknown;
    filters: unknown;
};

export type ResolveFilterExpressionArgsResult = ResolutionResult<{
    persistedArgs: ToolRunQueryExpressionResolvedArgs;
    transformed: ToolRunQueryArgsTransformed;
}>;

type ResolveFilterExpressionArgsOptions = {
    toolArgs: ExpressionToolArgs;
    getExplore: (exploreName: string) => Explore | Promise<Explore>;
};

const success = <T>(data: T): ResolutionResult<T> => ({
    success: true,
    data,
});

const failure = <T = never>(
    error: FilterExpressionResolutionError,
): ResolutionResult<T> => ({ success: false, error });

const dateOrDateTimeSchema = z.union([
    z.string().date(),
    z.string().datetime(),
]);

const strictNumberPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

const relativeDateUnits = [
    UnitOfTime.days,
    UnitOfTime.weeks,
    UnitOfTime.months,
    UnitOfTime.quarters,
    UnitOfTime.years,
] as const;

type RelativeDateUnit = (typeof relativeDateUnits)[number];

const isRelativeDateUnit = (value: string): value is RelativeDateUnit =>
    relativeDateUnits.some((unit) => unit === value);

const getCategoryLabel = (category: QueryFilterExpressionCategory): string => {
    switch (category) {
        case 'dimensions':
            return 'dimension';
        case 'metrics':
            return 'metric';
        case 'tableCalculations':
            return 'table calculation';
        default:
            return assertUnreachable(
                category,
                `Unknown filter expression category: ${category}`,
            );
    }
};

const formatFieldId = (fieldId: string): string => {
    if (
        /^[A-Za-z0-9_.-]+$/.test(fieldId) &&
        !['and', 'or'].includes(fieldId.toLowerCase())
    ) {
        return fieldId;
    }

    return `\`${fieldId.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;
};

const exampleArguments = (
    operator: FilterOperator,
    filterType: FilterType,
): string | null => {
    if (
        operator === FilterOperator.NULL ||
        operator === FilterOperator.NOT_NULL
    ) {
        return null;
    }

    if (isFilterExpressionRelativeDateOperator(operator)) {
        return '30{unit:days,completed:false}';
    }

    if (
        operator === FilterOperator.IN_THE_CURRENT ||
        operator === FilterOperator.NOT_IN_THE_CURRENT
    ) {
        return 'months';
    }

    if (
        operator === FilterOperator.IN_BETWEEN ||
        operator === FilterOperator.NOT_IN_BETWEEN
    ) {
        return filterType === FilterType.DATE
            ? '2025-01-01,2025-01-31'
            : '10,100';
    }

    switch (filterType) {
        case FilterType.BOOLEAN:
            return 'true';
        case FilterType.STRING:
            return 'example';
        case FilterType.NUMBER:
            return '100';
        case FilterType.DATE:
            return '2025-01-01';
        default:
            return assertUnreachable(
                filterType,
                `Unknown filter type: ${filterType}`,
            );
    }
};

const expressionExample = (
    fieldId: string,
    operator: FilterOperator,
    filterType: FilterType,
): string => {
    const args = exampleArguments(operator, filterType);
    return `${formatFieldId(fieldId)} ${operator}${args === null ? '' : `=${args}`}`;
};

const genericExample = (source: FilterExpressionSource): string => {
    switch (source.kind) {
        case 'customMetricFilter':
            return 'orders_status equals=completed';
        case 'queryFilter': {
            const { category } = source;
            switch (category) {
                case 'dimensions':
                    return 'orders_status equals=completed';
                case 'metrics':
                    return 'orders_total_revenue greaterThan=100';
                case 'tableCalculations':
                    return 'profit_margin lessThan=0.2';
                default:
                    return assertUnreachable(
                        category,
                        'Unknown query filter category',
                    );
            }
        }
        default:
            return assertUnreachable(source, 'Unknown expression source');
    }
};

const parserError = (
    source: FilterExpressionSource,
    error: FilterExpressionParseError,
): FilterExpressionResolutionError => {
    switch (error.code) {
        case 'FILTER_EXPRESSION_SYNTAX':
        case 'FILTER_EXPRESSION_MIXED_CONNECTORS':
            return {
                code: error.code,
                source,
                span: error.span,
                parserMessage: error.message,
                problem: error.message,
                guidance:
                    error.code === 'FILTER_EXPRESSION_MIXED_CONNECTORS'
                        ? 'Use only AND or only OR within this expression.'
                        : 'Use the documented field operator=value grammar and remove malformed or trailing input.',
                example: genericExample(source),
            };
        case 'FILTER_EXPRESSION_BOUNDS_EXCEEDED':
            return {
                code: error.code,
                source,
                span: error.span,
                limit: error.limit,
                maximum: error.maximum,
                actual: error.actual,
                problem: error.message,
                guidance:
                    'Shorten or split the expression so it stays within the documented safety limits.',
                example: genericExample(source),
            };
        default:
            return assertUnreachable(error, 'Unknown parser error');
    }
};

const parseExpression = (
    expression: string,
    source: FilterExpressionSource,
): ResolutionResult<FilterExpressionAst> => {
    const parsed = parseFilterExpression(expression);
    return parsed.success
        ? success(parsed.expression)
        : failure(parserError(source, parsed.error));
};

const makeExploreFields = (
    explore: Parameters<typeof getFields>[0],
): ResolvedField[] =>
    getFields(explore).map((field) => ({
        id: getItemId(field),
        table: field.table,
        fieldType: field.type,
        filterType: getFilterTypeFromItemType(field.type),
        category: isDimension(field) ? 'dimensions' : 'metrics',
    }));

const makeQueryFields = ({
    explore,
    transformedCustomMetrics,
    tableCalculations,
}: {
    explore: Parameters<typeof getFields>[0];
    transformedCustomMetrics: ReturnType<
        typeof customMetricsSchemaTransformed.parse
    >;
    tableCalculations: ExpressionQueryConfig['tableCalculations'];
}): ResolvedField[] => {
    const customMetricFields = populateCustomMetricsSQL(
        filterAggregationCustomMetrics(transformedCustomMetrics),
        explore,
    ).flatMap((additionalMetric) => {
        const table = explore.tables[additionalMetric.table];
        if (!table) return [];
        const metric = convertAdditionalMetric({ additionalMetric, table });
        return [
            {
                id: getItemId(metric),
                table: metric.table,
                fieldType: metric.type,
                filterType: getFilterTypeFromItemType(metric.type),
                category: 'metrics' as const,
            },
        ];
    });

    const tableCalculationFields = convertAiTableCalcsSchemaToTableCalcs(
        tableCalculations ?? null,
    ).map((tableCalculation): ResolvedField => {
        const fieldType = tableCalculation.type ?? TableCalculationType.NUMBER;
        return {
            id: tableCalculation.name,
            table: null,
            fieldType,
            filterType: getFilterTypeFromItemType(fieldType),
            category: 'tableCalculations',
        };
    });

    return [
        ...makeExploreFields(explore),
        ...customMetricFields,
        ...tableCalculationFields,
    ];
};

const getFieldMatches = (
    fields: ResolvedField[],
    fieldId: string,
): ResolvedField[] => fields.filter((field) => field.id === fieldId);

// Keep expression filters aligned with the structured AI filter contract.
// Post-calculation metric types remain unsupported in both contracts.
const isSupportedAiFilterField = (field: ResolvedField): boolean =>
    filterRuleSchema.safeParse({
        fieldId: field.id,
        fieldType:
            field.category === 'tableCalculations'
                ? DimensionType.NUMBER
                : field.fieldType,
        fieldFilterType: field.filterType,
        operator: FilterOperator.NULL,
    }).success;

const invalidValueError = ({
    source,
    rule,
    field,
    span,
    problem,
    guidance,
    example,
}: {
    source: FilterExpressionSource;
    rule: FilterExpressionRule;
    field: ResolvedField;
    span: FilterExpressionSpan;
    problem: string;
    guidance: string;
    example?: string;
}): FilterExpressionResolutionError => ({
    code: 'FILTER_EXPRESSION_INVALID_VALUE',
    source,
    span,
    fieldId: field.id,
    operator: rule.operator.value,
    filterType: field.filterType,
    problem,
    guidance,
    example:
        example ??
        expressionExample(field.id, rule.operator.value, field.filterType),
});

const resolveField = ({
    fields,
    rule,
    source,
}: {
    fields: ResolvedField[];
    rule: FilterExpressionRule;
    source: FilterExpressionSource;
}): ResolutionResult<ResolvedField> => {
    const matches = getFieldMatches(fields, rule.field.value);
    if (matches.length !== 1) {
        const suggestionFields =
            source.kind === 'queryFilter'
                ? fields.filter(({ category }) => category === source.category)
                : fields;
        const suggestions =
            matches.length === 0
                ? suggestClosestFieldIds(
                      rule.field.value,
                      suggestionFields.map(({ id }) => id),
                      1,
                  )
                : [];
        const suggestedField = suggestions[0]
            ? suggestionFields.find(({ id }) => id === suggestions[0])
            : undefined;
        const example = suggestedField
            ? expressionExample(
                  suggestedField.id,
                  FilterOperator.EQUALS,
                  suggestedField.filterType,
              )
            : genericExample(source);
        const reason = matches.length === 0 ? 'notFound' : 'ambiguous';
        const suggestionText = suggestions.length
            ? ` Did you mean: ${suggestions.join(', ')}?`
            : '';
        return failure({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            source,
            span: rule.field.span,
            fieldId: rule.field.value,
            reason,
            suggestions,
            problem:
                reason === 'notFound'
                    ? `The field does not exist in explore "${source.exploreName}".${suggestionText}`
                    : `The field ID matches multiple fields in explore "${source.exploreName}" and cannot be resolved safely.`,
            guidance:
                reason === 'notFound'
                    ? `Replace it with an existing ${source.kind === 'queryFilter' ? getCategoryLabel(source.category) : 'explore'} field ID, or use field discovery to find the field.`
                    : 'Rename or remove the colliding custom metric or table calculation, then use an unambiguous field ID.',
            example,
        });
    }

    const field = matches[0];
    if (source.kind === 'queryFilter' && field.category !== source.category) {
        const operatorIsAvailable = filterExpressionOperatorDefinitions.some(
            ({ operator, argumentCountByFilterType }) =>
                operator === rule.operator.value &&
                argumentCountByFilterType[field.filterType] !== null,
        );
        return failure({
            code: 'FILTER_EXPRESSION_WRONG_CATEGORY',
            source,
            span: rule.field.span,
            fieldId: field.id,
            expectedCategory: field.category,
            actualCategory: source.category,
            problem: `The field is a ${getCategoryLabel(field.category)}, not a ${getCategoryLabel(source.category)}.`,
            guidance: `Remove this rule from queryConfig.filters.${source.category} and move this rule to queryConfig.filters.${field.category}.`,
            example: expressionExample(
                field.id,
                operatorIsAvailable
                    ? rule.operator.value
                    : FilterOperator.EQUALS,
                field.filterType,
            ),
        });
    }

    return success(field);
};

const strictNumber = (scalar: FilterExpressionScalar): number | null => {
    if (!strictNumberPattern.test(scalar.value)) return null;
    const value = Number(scalar.value);
    return Number.isFinite(value) ? value : null;
};

const strictBoolean = (scalar: FilterExpressionScalar): boolean | null => {
    if (scalar.value === 'true') return true;
    if (scalar.value === 'false') return false;
    return null;
};

const hasExpectedArity = (
    expected: FilterExpressionArgumentCount,
    actual: number,
): boolean => (expected === 'oneOrMore' ? actual >= 1 : actual === expected);

const expectedArityText = (expected: FilterExpressionArgumentCount): string =>
    expected === 'oneOrMore'
        ? 'one or more values'
        : `exactly ${expected} ${expected === 1 ? 'value' : 'values'}`;

const convertStandardValues = ({
    rule,
    field,
    source,
}: {
    rule: FilterExpressionRule;
    field: ResolvedField;
    source: FilterExpressionSource;
}): ResolutionResult<RawFilterValue[]> => {
    const values: RawFilterValue[] = [];
    for (const scalar of rule.arguments) {
        switch (field.filterType) {
            case FilterType.STRING:
                values.push(scalar.value);
                break;
            case FilterType.NUMBER: {
                const value = strictNumber(scalar);
                if (value === null) {
                    return failure(
                        invalidValueError({
                            source,
                            rule,
                            field,
                            span: scalar.span,
                            problem: `"${rule.operator.value}" requires finite number values.`,
                            guidance:
                                'Replace the highlighted value with a decimal or scientific-notation finite number.',
                        }),
                    );
                }
                values.push(value);
                break;
            }
            case FilterType.BOOLEAN: {
                const value = strictBoolean(scalar);
                if (value === null) {
                    return failure(
                        invalidValueError({
                            source,
                            rule,
                            field,
                            span: scalar.span,
                            problem: `"${rule.operator.value}" requires exactly true or false.`,
                            guidance:
                                'Replace the highlighted value with the exact text true or false.',
                        }),
                    );
                }
                values.push(value);
                break;
            }
            case FilterType.DATE:
                if (!dateOrDateTimeSchema.safeParse(scalar.value).success) {
                    return failure(
                        invalidValueError({
                            source,
                            rule,
                            field,
                            span: scalar.span,
                            problem: `"${rule.operator.value}" requires ISO date or UTC datetime values.`,
                            guidance:
                                'Use YYYY-MM-DD or an ISO UTC datetime such as 2025-01-01T12:00:00Z.',
                        }),
                    );
                }
                values.push(scalar.value);
                break;
            default:
                return assertUnreachable(
                    field.filterType,
                    `Unknown filter type: ${field.filterType}`,
                );
        }
    }
    return success(values);
};

const resolveRelativeDateRule = ({
    rule,
    field,
    source,
}: {
    rule: FilterExpressionRule;
    field: ResolvedField;
    source: FilterExpressionSource;
}): ResolutionResult<RawFilterRule> => {
    const countScalar = rule.arguments[0];
    const count = countScalar ? strictNumber(countScalar) : null;
    if (count === null || !Number.isInteger(count) || count <= 0) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: countScalar?.span ?? rule.operator.span,
                problem: `"${rule.operator.value}" requires a positive integer period count.`,
                guidance:
                    'Replace the value with an integer greater than zero.',
            }),
        );
    }

    const { settings } = rule;
    if (!settings) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: rule.operator.span,
                problem: `"${rule.operator.value}" requires a settings object after the period count.`,
                guidance:
                    'Append {unit:days,completed:false}, using the required unit and completed setting names.',
            }),
        );
    }

    const unknownSetting = settings.entries.find(
        ({ name }) => name.value !== 'unit' && name.value !== 'completed',
    );
    if (unknownSetting) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: unknownSetting.name.span,
                problem: `Unknown relative-date setting "${unknownSetting.name.value}".`,
                guidance: 'Use only unit and completed in the settings object.',
            }),
        );
    }

    const unitSettings = settings.entries.filter(
        ({ name }) => name.value === 'unit',
    );
    const completedSettings = settings.entries.filter(
        ({ name }) => name.value === 'completed',
    );
    const duplicateSetting = unitSettings[1] ?? completedSettings[1];
    if (duplicateSetting) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: duplicateSetting.name.span,
                problem: `Relative-date setting "${duplicateSetting.name.value}" may appear only once.`,
                guidance:
                    'Remove the duplicate setting and provide unit and completed once each.',
            }),
        );
    }

    const unitSetting = unitSettings[0];
    const completedSetting = completedSettings[0];
    if (!unitSetting || !completedSetting) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: settings.span,
                problem: `"${rule.operator.value}" settings object requires both unit and completed.`,
                guidance:
                    'Provide {unit:days,completed:false} after the period count.',
            }),
        );
    }

    if (!isRelativeDateUnit(unitSetting.value.value)) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: unitSetting.value.span,
                problem: `The date unit must be one of days, weeks, months, quarters, or years.`,
                guidance:
                    'Replace unit with days, weeks, months, quarters, or years.',
            }),
        );
    }
    const completed = strictBoolean(completedSetting.value);
    if (completed === null) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: completedSetting.value.span,
                problem: `The completed setting must be exactly true or false.`,
                guidance:
                    'Set completed to false for a rolling period or true for completed periods only.',
            }),
        );
    }

    return success({
        fieldId: field.id,
        fieldType: field.fieldType,
        fieldFilterType: field.filterType,
        operator: rule.operator.value,
        values: [count],
        settings: {
            unitOfTime: unitSetting.value.value,
            completed,
        },
    });
};

const resolveCurrentDateRule = ({
    rule,
    field,
    source,
}: {
    rule: FilterExpressionRule;
    field: ResolvedField;
    source: FilterExpressionSource;
}): ResolutionResult<RawFilterRule> => {
    const unitScalar = rule.arguments[0];
    if (!unitScalar || !isRelativeDateUnit(unitScalar.value)) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: unitScalar?.span ?? rule.operator.span,
                problem: `The current-period unit must be one of days, weeks, months, quarters, or years.`,
                guidance:
                    'Replace the value with days, weeks, months, quarters, or years.',
            }),
        );
    }

    return success({
        fieldId: field.id,
        fieldType: field.fieldType,
        fieldFilterType: field.filterType,
        operator: rule.operator.value,
        values: [1],
        settings: { unitOfTime: unitScalar.value, completed: false },
    });
};

const resolveRule = ({
    rule,
    fields,
    source,
}: {
    rule: FilterExpressionRule;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): ResolutionResult<RawFilterRule> => {
    const fieldResult = resolveField({ fields, rule, source });
    if (!fieldResult.success) return fieldResult;
    const field = fieldResult.data;

    if (
        field.category === 'tableCalculations' &&
        field.filterType !== FilterType.NUMBER
    ) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: rule.field.span,
                problem:
                    'Only numeric table calculations can be filtered in the current AI query contract.',
                guidance:
                    'Use a numeric table calculation, or remove this table-calculation filter.',
                example: 'profit_margin lessThan=0.2',
            }),
        );
    }

    if (!isSupportedAiFilterField(field)) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: rule.field.span,
                problem: `Metric type "${field.fieldType}" is not supported by AI filters.`,
                guidance:
                    'Use another metric whose type is supported by AI filters, or remove this filter rule.',
                example: genericExample(source),
            }),
        );
    }

    if (
        rule.settings &&
        !isFilterExpressionRelativeDateOperator(rule.operator.value)
    ) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: rule.settings.span,
                problem: `"${rule.operator.value}" does not accept a settings object.`,
                guidance:
                    'Remove the settings object and provide only the operator values.',
            }),
        );
    }

    const bareNull = rule.arguments.find(
        (argument) => argument.kind === 'bareNull',
    );
    if (bareNull) {
        if (
            rule.arguments.length === 1 &&
            (rule.operator.value === FilterOperator.EQUALS ||
                rule.operator.value === FilterOperator.NOT_EQUALS)
        ) {
            return success({
                fieldId: field.id,
                fieldType:
                    field.category === 'tableCalculations'
                        ? DimensionType.NUMBER
                        : field.fieldType,
                fieldFilterType: field.filterType,
                operator:
                    rule.operator.value === FilterOperator.EQUALS
                        ? FilterOperator.NULL
                        : FilterOperator.NOT_NULL,
            });
        }
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: bareNull.span,
                problem:
                    'Bare null is only valid as the sole value of equals or notEquals.',
                guidance:
                    "Use equals=null or notEquals=null by itself, or quote 'null' for a literal string value.",
                example: `${formatFieldId(field.id)} equals=null`,
            }),
        );
    }

    const definition = filterExpressionOperatorDefinitions.find(
        ({ operator }) => operator === rule.operator.value,
    );
    if (!definition) {
        throw new Error(
            `Missing filter expression operator definition for ${rule.operator.value}`,
        );
    }
    const expectedArity =
        definition.argumentCountByFilterType[field.filterType];
    if (expectedArity === null) {
        return failure(
            invalidValueError({
                source,
                rule,
                field,
                span: rule.operator.span,
                problem: `"${rule.operator.value}" is not available for ${field.filterType} fields.`,
                guidance:
                    'Choose an operator documented for this field type, or move the rule to the correct field.',
                example: expressionExample(
                    field.id,
                    FilterOperator.EQUALS,
                    field.filterType,
                ),
            }),
        );
    }
    if (!hasExpectedArity(expectedArity, rule.arguments.length)) {
        return failure({
            code: 'FILTER_EXPRESSION_WRONG_ARITY',
            source,
            span: rule.operator.span,
            fieldId: field.id,
            operator: rule.operator.value,
            expected: expectedArity,
            actual: rule.arguments.length,
            problem: `"${rule.operator.value}" requires ${expectedArityText(expectedArity)}, but received ${rule.arguments.length}.`,
            guidance: `Supply ${expectedArityText(expectedArity)} after the equals sign.`,
            example: expressionExample(
                field.id,
                rule.operator.value,
                field.filterType,
            ),
        });
    }

    const { value: operator } = rule.operator;
    switch (operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return success({
                fieldId: field.id,
                fieldType:
                    field.category === 'tableCalculations'
                        ? DimensionType.NUMBER
                        : field.fieldType,
                fieldFilterType: field.filterType,
                operator,
            });
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return resolveRelativeDateRule({ rule, field, source });
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return resolveCurrentDateRule({ rule, field, source });
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
        case FilterOperator.STARTS_WITH:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN: {
            const valuesResult = convertStandardValues({
                rule,
                field,
                source,
            });
            if (!valuesResult.success) return valuesResult;

            return success({
                fieldId: field.id,
                fieldType:
                    field.category === 'tableCalculations'
                        ? DimensionType.NUMBER
                        : field.fieldType,
                fieldFilterType: field.filterType,
                operator,
                values: valuesResult.data,
            });
        }
        default:
            return assertUnreachable(
                operator,
                `Unhandled filter expression operator: ${operator}`,
            );
    }
};

const resolveCustomMetrics = ({
    customMetrics,
    explore,
}: {
    customMetrics: ExpressionQueryConfig['customMetrics'];
    explore: Parameters<typeof getFields>[0];
}): ResolutionResult<{
    raw: unknown;
    transformed: ReturnType<typeof customMetricsSchemaTransformed.parse>;
}> => {
    if (!customMetrics) {
        return success({ raw: null, transformed: null });
    }

    const exploreFields = makeExploreFields(explore);
    const rawCustomMetrics: unknown[] = [];
    for (const customMetric of customMetrics) {
        if (
            customMetric.kind === 'aggregation' &&
            customMetric.filters !== null
        ) {
            const source: FilterExpressionSource = {
                kind: 'customMetricFilter',
                exploreName: explore.name,
                category: 'customMetric',
                customMetricName: customMetric.name,
            };
            const parsedResult = parseExpression(customMetric.filters, source);
            if (!parsedResult.success) return parsedResult;
            const expression = parsedResult.data;
            if (expression.connector === 'or') {
                return failure({
                    code: 'FILTER_EXPRESSION_CUSTOM_METRIC_OR',
                    source,
                    span: expression.rules[1]?.span ?? expression.span,
                    problem:
                        'Aggregation custom metric filter rules are always combined with AND and cannot use OR.',
                    guidance:
                        'Replace OR with AND, or define separate custom metrics.',
                    example:
                        'orders_status equals=completed AND orders_region equals=emea',
                });
            }

            const filters: { table: string; filter: RawFilterRule }[] = [];
            for (const rule of expression.rules) {
                const ruleResult = resolveRule({
                    rule,
                    fields: exploreFields,
                    source,
                });
                if (!ruleResult.success) return ruleResult;
                const fieldResult = resolveField({
                    fields: exploreFields,
                    rule,
                    source,
                });
                if (!fieldResult.success) return fieldResult;
                const field = fieldResult.data;
                if (field.table === null) {
                    throw new Error(
                        `Explore field ${field.id} does not have a source table`,
                    );
                }
                filters.push({ table: field.table, filter: ruleResult.data });
            }
            rawCustomMetrics.push({ ...customMetric, filters });
        } else {
            rawCustomMetrics.push(customMetric);
        }
    }

    const transformed = customMetricsSchemaTransformed.parse(rawCustomMetrics);
    return success({ raw: rawCustomMetrics, transformed });
};

const resolveQueryFilters = ({
    filters,
    fields,
    exploreName,
}: {
    filters: ExpressionQueryConfig['filters'];
    fields: ResolvedField[];
    exploreName: string;
}): ResolutionResult<unknown> => {
    if (filters === null) return success(null);

    const expressions: Record<QueryFilterExpressionCategory, string | null> = {
        dimensions: filters.dimensions,
        metrics: filters.metrics,
        tableCalculations: filters.tableCalculations,
    };
    type ResolvedCategoryGroup = {
        connector: 'and' | 'or' | null;
        rules: RawFilterRule[];
    };
    const resolvedGroups: Record<
        QueryFilterExpressionCategory,
        ResolvedCategoryGroup | null
    > = {
        dimensions: null,
        metrics: null,
        tableCalculations: null,
    };

    const categories: QueryFilterExpressionCategory[] = [
        'dimensions',
        'metrics',
        'tableCalculations',
    ];
    for (const category of categories) {
        const expressionInput = expressions[category];
        if (expressionInput !== null) {
            const source: FilterExpressionSource = {
                kind: 'queryFilter',
                exploreName,
                category,
            };
            const parsedResult = parseExpression(expressionInput, source);
            if (!parsedResult.success) return parsedResult;
            const expression = parsedResult.data;

            const categoryRules: RawFilterRule[] = [];
            for (const rule of expression.rules) {
                const ruleResult = resolveRule({ rule, fields, source });
                if (!ruleResult.success) return ruleResult;
                categoryRules.push(ruleResult.data);
            }
            resolvedGroups[category] = {
                connector: expression.connector,
                rules: categoryRules,
            };
        }
    }

    // Each category owns an independent FilterGroup, so categories may use
    // different connectors. When every explicit connector agrees, emit the
    // legacy shared-connector filters object so resolved data stays
    // byte-identical to previously persisted artifacts; only diverging
    // connectors need the per-category V2 shape.
    const explicitConnectors = [
        ...new Set(
            categories.flatMap((category) => {
                const group = resolvedGroups[category];
                return group?.connector ? [group.connector] : [];
            }),
        ),
    ];

    if (explicitConnectors.length <= 1) {
        return success({
            type: explicitConnectors[0] ?? 'and',
            dimensions: resolvedGroups.dimensions?.rules ?? null,
            metrics: resolvedGroups.metrics?.rules ?? null,
            tableCalculations: resolvedGroups.tableCalculations?.rules ?? null,
        });
    }

    const toResolvedGroup = (group: ResolvedCategoryGroup | null) =>
        group === null
            ? null
            : { connector: group.connector ?? 'and', rules: group.rules };

    return success({
        dimensions: toResolvedGroup(resolvedGroups.dimensions),
        metrics: toResolvedGroup(resolvedGroups.metrics),
        tableCalculations: toResolvedGroup(resolvedGroups.tableCalculations),
    });
};

const resolveQueryConfig = ({
    queryConfig,
    explore,
}: {
    queryConfig: ExpressionQueryConfig;
    explore: Parameters<typeof getFields>[0];
}): ResolutionResult<ResolvedQueryConfigParts> => {
    const customMetricsResult = resolveCustomMetrics({
        customMetrics: queryConfig.customMetrics,
        explore,
    });
    if (!customMetricsResult.success) return customMetricsResult;

    const fields = makeQueryFields({
        explore,
        transformedCustomMetrics: customMetricsResult.data.transformed,
        tableCalculations: queryConfig.tableCalculations,
    });
    const filtersResult = resolveQueryFilters({
        filters: queryConfig.filters,
        fields,
        exploreName: explore.name,
    });
    if (!filtersResult.success) return filtersResult;

    return success({
        customMetrics: customMetricsResult.data.raw,
        filters: filtersResult.data,
    });
};

export const resolveFilterExpressionArgs = async ({
    toolArgs,
    getExplore,
}: ResolveFilterExpressionArgsOptions): Promise<ResolveFilterExpressionArgsResult> => {
    const mainExplore = await getExplore(toolArgs.queryConfig.exploreName);
    const mainResult = resolveQueryConfig({
        queryConfig: toolArgs.queryConfig,
        explore: mainExplore,
    });
    if (!mainResult.success) return mainResult;

    const queryConfig = {
        ...toolArgs.queryConfig,
        customMetrics: mainResult.data.customMetrics,
        filters: mainResult.data.filters,
    };

    let mergeConfig: unknown = null;
    if ('mergeConfig' in toolArgs && toolArgs.mergeConfig) {
        const inputMergeConfig = toolArgs.mergeConfig;
        const sourceResults = await Promise.all(
            inputMergeConfig.additionalSources.map(async (source) => {
                const sourceExplore = await getExplore(
                    source.queryConfig.exploreName,
                );
                return {
                    source,
                    result: resolveQueryConfig({
                        queryConfig: source.queryConfig,
                        explore: sourceExplore,
                    }),
                };
            }),
        );
        const additionalSources: unknown[] = [];
        for (const { source, result } of sourceResults) {
            if (!result.success) return result;
            additionalSources.push({
                ...source,
                queryConfig: {
                    ...source.queryConfig,
                    customMetrics: result.data.customMetrics,
                    filters: result.data.filters,
                },
            });
        }
        mergeConfig = { ...inputMergeConfig, additionalSources };
    }

    const persistedArgs = toolRunQueryExpressionResolvedArgsSchema.parse({
        ...toolArgs,
        queryConfig,
        mergeConfig,
    });
    const transformed =
        toolRunQueryExpressionResolvedArgsSchemaTransformed.parse(
            persistedArgs,
        );
    return success({ persistedArgs, transformed });
};
