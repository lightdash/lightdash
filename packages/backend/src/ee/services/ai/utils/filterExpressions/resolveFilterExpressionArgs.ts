import {
    assertUnreachable,
    convertAdditionalMetric,
    convertAiTableCalcsSchemaToTableCalcs,
    customMetricsSchemaTransformed,
    DimensionType,
    FILTER_EXPRESSION_MAX_RULES,
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
    FilterExpressionFieldSuggestion,
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

const getOperatorDefinition = (operator: FilterOperator) => {
    const definition = filterExpressionOperatorDefinitions.find(
        (candidate) => candidate.operator === operator,
    );
    if (!definition) {
        throw new Error(
            `Missing filter expression operator definition for ${operator}`,
        );
    }
    return definition;
};

const operatorSupportsFilterType = (
    operator: FilterOperator,
    filterType: FilterType,
): boolean =>
    getOperatorDefinition(operator).argumentCountByFilterType[filterType] !==
    null;

const formatFieldId = (fieldId: string): string => {
    if (
        /^[A-Za-z0-9_.-]+$/.test(fieldId) &&
        !['and', 'or'].includes(fieldId.toLowerCase())
    ) {
        return fieldId;
    }

    return `\`${fieldId.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;
};

const illustrativeValue = (filterType: FilterType): string => {
    switch (filterType) {
        case FilterType.BOOLEAN:
            return 'true';
        case FilterType.STRING:
            return '"example value"';
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

    return illustrativeValue(filterType);
};

const supportedOperatorsForFilterType = (filterType: FilterType): string =>
    filterExpressionOperatorDefinitions
        .filter(
            ({ argumentCountByFilterType }) =>
                argumentCountByFilterType[filterType] !== null,
        )
        .map(({ operator }) => operator)
        .join(', ');

const neutralExample = '`field ID` equals="example value"';

const expressionExample = (
    fieldId: string,
    operator: FilterOperator,
    filterType: FilterType,
): string => {
    const args = exampleArguments(operator, filterType);
    const candidate = `${formatFieldId(fieldId)} ${operator}${args === null ? '' : `=${args}`}`;
    return parseFilterExpression(candidate).success
        ? candidate
        : neutralExample;
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

const makeTableCalculationFields = (
    tableCalculations: ExpressionQueryConfig['tableCalculations'],
): ResolvedField[] =>
    convertAiTableCalcsSchemaToTableCalcs(tableCalculations ?? null).map(
        (tableCalculation): ResolvedField => {
            const fieldType =
                tableCalculation.type ?? TableCalculationType.NUMBER;
            return {
                id: tableCalculation.name,
                table: null,
                fieldType,
                filterType: getFilterTypeFromItemType(fieldType),
                category: 'tableCalculations',
            };
        },
    );

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

    return [
        ...makeExploreFields(explore),
        ...customMetricFields,
        ...makeTableCalculationFields(tableCalculations),
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

const isFieldInSourceCategory = (
    field: ResolvedField,
    source: FilterExpressionSource,
): boolean => {
    switch (source.kind) {
        case 'queryFilter':
            return field.category === source.category;
        case 'customMetricFilter':
            return field.category === 'dimensions';
        default:
            return assertUnreachable(source, 'Unknown expression source');
    }
};

const getAllowedFieldLabel = (source: FilterExpressionSource): string => {
    switch (source.kind) {
        case 'queryFilter':
            return getCategoryLabel(source.category);
        case 'customMetricFilter':
            return 'dimension';
        default:
            return assertUnreachable(source, 'Unknown expression source');
    }
};

const getSuggestionFields = ({
    fields,
    rule,
    source,
}: {
    fields: ResolvedField[];
    rule: FilterExpressionRule;
    source: FilterExpressionSource;
}): ResolvedField[] =>
    fields.filter(
        (field) =>
            getFieldMatches(fields, field.id).length === 1 &&
            isFieldInSourceCategory(field, source) &&
            (field.category !== 'tableCalculations' ||
                field.filterType === FilterType.NUMBER) &&
            operatorSupportsFilterType(rule.operator.value, field.filterType),
    );

const toFieldSuggestion = (
    field: ResolvedField,
): FilterExpressionFieldSuggestion => ({
    fieldId: field.id,
    category: field.category,
    filterType: field.filterType,
});

const formatFieldSuggestion = ({
    fieldId,
    category,
    filterType,
}: FilterExpressionFieldSuggestion): string =>
    `${formatFieldId(fieldId)} (${getCategoryLabel(category)}, ${filterType})`;

const compareFieldIds = (left: ResolvedField, right: ResolvedField): number => {
    if (left.id < right.id) return -1;
    if (left.id > right.id) return 1;
    return 0;
};

const scopedExample = (
    source: FilterExpressionSource,
    fields: ResolvedField[],
): string => {
    const matchingFields = fields
        .filter(
            (field) =>
                getFieldMatches(fields, field.id).length === 1 &&
                isFieldInSourceCategory(field, source) &&
                (field.category !== 'tableCalculations' ||
                    field.filterType === FilterType.NUMBER),
        )
        .sort(compareFieldIds);
    const field = matchingFields[0];
    return field
        ? expressionExample(field.id, FilterOperator.EQUALS, field.filterType)
        : neutralExample;
};

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
    example?: string | null;
}): FilterExpressionResolutionError => ({
    code: 'FILTER_EXPRESSION_INVALID_VALUE',
    source,
    span,
    fieldId: field.id,
    operator: rule.operator.value,
    filterType: field.filterType,
    problem,
    guidance,
    example: example === undefined ? null : example,
});

const resolveField = ({
    expressionInput,
    fields,
    rule,
    source,
}: {
    expressionInput: string;
    fields: ResolvedField[];
    rule: FilterExpressionRule;
    source: FilterExpressionSource;
}): ResolutionResult<ResolvedField> => {
    const matches = getFieldMatches(fields, rule.field.value);
    if (matches.length !== 1) {
        const suggestionFields = getSuggestionFields({ fields, rule, source });
        const suggestionIds =
            matches.length === 0
                ? suggestClosestFieldIds(
                      rule.field.value,
                      suggestionFields.map(({ id }) => id),
                      1,
                  )
                : [];
        const suggestedField = suggestionIds[0]
            ? suggestionFields.find(({ id }) => id === suggestionIds[0])
            : undefined;
        const suggestedFields = suggestedField
            ? [toFieldSuggestion(suggestedField)]
            : [];
        const suggestions = suggestedFields.map(({ fieldId }) => fieldId);
        const reason = matches.length === 0 ? 'notFound' : 'ambiguous';
        const suggestionText = suggestedFields.length
            ? ` Did you mean: ${suggestedFields
                  .map(formatFieldSuggestion)
                  .join(', ')}?`
            : '';
        return failure({
            code: 'FILTER_EXPRESSION_UNKNOWN_FIELD',
            source,
            span: rule.field.span,
            fieldId: rule.field.value,
            reason,
            suggestions,
            suggestedFields,
            problem:
                reason === 'notFound'
                    ? `The field does not exist in explore "${source.exploreName}".${suggestionText}`
                    : `The field ID matches multiple fields in explore "${source.exploreName}" and cannot be resolved safely.`,
            guidance:
                reason === 'notFound'
                    ? `Replace it with an existing ${getAllowedFieldLabel(source)} field ID, or use field discovery to find the field.`
                    : 'Rename or remove the colliding custom metric or table calculation, then use an unambiguous field ID.',
            example: null,
        });
    }

    const field = matches[0];
    switch (source.kind) {
        case 'queryFilter': {
            if (field.category === source.category) return success(field);
            const operatorIsAvailable = operatorSupportsFilterType(
                rule.operator.value,
                field.filterType,
            );
            const originalRule = expressionInput.slice(
                rule.span.start.offset,
                rule.span.end.offset,
            );
            return failure({
                code: 'FILTER_EXPRESSION_WRONG_CATEGORY',
                source,
                span: rule.field.span,
                fieldId: field.id,
                expectedCategory: field.category,
                actualCategory: source.category,
                problem: `The field is a ${getCategoryLabel(field.category)}, not a ${getCategoryLabel(source.category)}.`,
                guidance: `Move this rule from the ${getCategoryLabel(source.category)} filters to the ${getCategoryLabel(field.category)} filters.`,
                example: operatorIsAvailable
                    ? originalRule
                    : expressionExample(
                          field.id,
                          FilterOperator.EQUALS,
                          field.filterType,
                      ),
            });
        }
        case 'customMetricFilter':
            switch (field.category) {
                case 'dimensions':
                    return success(field);
                case 'metrics':
                case 'tableCalculations':
                    return failure({
                        code: 'FILTER_EXPRESSION_CUSTOM_METRIC_WRONG_CATEGORY',
                        source,
                        span: rule.field.span,
                        fieldId: field.id,
                        allowedCategory: 'dimensions',
                        fieldCategory: field.category,
                        problem: `The field is a ${getCategoryLabel(field.category)}, but custom metric filters only accept dimension fields.`,
                        guidance:
                            'Replace it with an existing dimension field ID, or use field discovery to find one.',
                        example: null,
                    });
                default:
                    return assertUnreachable(
                        field.category,
                        'Unknown resolved field category',
                    );
            }
        default:
            return assertUnreachable(source, 'Unknown expression source');
    }
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

const replaceScalarInRuleExample = ({
    expressionInput,
    replacementValue,
    rule,
    scalar,
}: {
    expressionInput: string;
    replacementValue: string;
    rule: FilterExpressionRule;
    scalar: FilterExpressionScalar;
}): string | null => {
    const originalScalar = expressionInput.slice(
        scalar.span.start.offset,
        scalar.span.end.offset,
    );
    const quote = originalScalar.charAt(0);
    const replacement =
        scalar.kind === 'quoted' && (quote === "'" || quote === '"')
            ? `${quote}${replacementValue}${quote}`
            : replacementValue;
    const candidate = `${expressionInput.slice(rule.span.start.offset, scalar.span.start.offset)}${replacement}${expressionInput.slice(scalar.span.end.offset, rule.span.end.offset)}`;
    return parseFilterExpression(candidate).success ? candidate : null;
};

const getLosslessBooleanRepairExample = ({
    expressionInput,
    rule,
    scalar,
}: {
    expressionInput: string;
    rule: FilterExpressionRule;
    scalar: FilterExpressionScalar;
}): string | null => {
    const normalized = scalar.value.toLowerCase();
    return normalized === 'true' || normalized === 'false'
        ? replaceScalarInRuleExample({
              expressionInput,
              replacementValue: normalized,
              rule,
              scalar,
          })
        : null;
};

const hasExpectedArity = (
    expected: FilterExpressionArgumentCount,
    actual: number,
): boolean => (expected === 'oneOrMore' ? actual >= 1 : actual === expected);

const expectedArityText = (expected: FilterExpressionArgumentCount): string =>
    expected === 'oneOrMore'
        ? 'one or more values'
        : `exactly ${expected} ${expected === 1 ? 'value' : 'values'}`;

const wrongArityGuidance = (
    expected: FilterExpressionArgumentCount,
    actual: number,
): string => {
    if (expected === 'oneOrMore') {
        return 'Add at least one intended value after the equals sign.';
    }
    const difference = Math.abs(expected - actual);
    const differenceLabel = `${difference} ${difference === 1 ? 'value' : 'values'}`;
    return actual > expected
        ? `Remove ${differenceLabel}, leaving ${expectedArityText(expected)} after the equals sign.`
        : `Add ${differenceLabel}, supplying ${expectedArityText(expected)} after the equals sign.`;
};

const getPositionalRelativeDateRepairExample = ({
    expressionInput,
    rule,
}: {
    expressionInput: string;
    rule: FilterExpressionRule;
}): string | null => {
    if (
        rule.settings ||
        !isFilterExpressionRelativeDateOperator(rule.operator.value) ||
        rule.arguments.length !== 3
    ) {
        return null;
    }

    const countScalar = rule.arguments[0];
    const unitScalar = rule.arguments[1];
    const completedScalar = rule.arguments[2];
    if (!countScalar || !unitScalar || !completedScalar) return null;
    const count = strictNumber(countScalar);
    if (
        count === null ||
        !Number.isInteger(count) ||
        count <= 0 ||
        !isRelativeDateUnit(unitScalar.value) ||
        strictBoolean(completedScalar) === null
    ) {
        return null;
    }

    const unit = expressionInput.slice(
        unitScalar.span.start.offset,
        unitScalar.span.end.offset,
    );
    const completed = expressionInput.slice(
        completedScalar.span.start.offset,
        completedScalar.span.end.offset,
    );
    const candidate = `${expressionInput.slice(rule.span.start.offset, countScalar.span.end.offset)}{unit:${unit},completed:${completed}}`;
    return parseFilterExpression(candidate).success ? candidate : null;
};

const convertStandardValues = ({
    expressionInput,
    rule,
    field,
    source,
}: {
    expressionInput: string;
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
                                'Replace the value at the reported location with a decimal or scientific-notation finite number.',
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
                                'Replace the value at the reported location with the exact text true or false.',
                            example: getLosslessBooleanRepairExample({
                                expressionInput,
                                rule,
                                scalar,
                            }),
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
    expressionInput,
    rule,
    field,
    source,
}: {
    expressionInput: string;
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
                example: replaceScalarInRuleExample({
                    expressionInput,
                    replacementValue: 'days',
                    rule,
                    scalar: unitSetting.value,
                }),
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
                example: getLosslessBooleanRepairExample({
                    expressionInput,
                    rule,
                    scalar: completedSetting.value,
                }),
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
    expressionInput,
    rule,
    field,
    source,
}: {
    expressionInput: string;
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
                example: unitScalar
                    ? replaceScalarInRuleExample({
                          expressionInput,
                          replacementValue: 'days',
                          rule,
                          scalar: unitScalar,
                      })
                    : null,
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
    expressionInput,
    rule,
    fields,
    source,
}: {
    expressionInput: string;
    rule: FilterExpressionRule;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): ResolutionResult<RawFilterRule> => {
    const fieldResult = resolveField({ expressionInput, fields, rule, source });
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
                example: scopedExample(source, fields),
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
            }),
        );
    }

    const definition = getOperatorDefinition(rule.operator.value);
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
                guidance: `Use a supported ${field.filterType} operator (${supportedOperatorsForFilterType(field.filterType)}), or move the rule to a field of a matching type.`,
            }),
        );
    }
    if (!hasExpectedArity(expectedArity, rule.arguments.length)) {
        const positionalRelativeDateRepair =
            getPositionalRelativeDateRepairExample({ expressionInput, rule });
        return failure({
            code: 'FILTER_EXPRESSION_WRONG_ARITY',
            source,
            span: rule.operator.span,
            fieldId: field.id,
            operator: rule.operator.value,
            expected: expectedArity,
            actual: rule.arguments.length,
            problem: `"${rule.operator.value}" requires ${expectedArityText(expectedArity)}, but received ${rule.arguments.length}.`,
            guidance:
                positionalRelativeDateRepair === null
                    ? wrongArityGuidance(expectedArity, rule.arguments.length)
                    : 'Keep the period count as the only value and move unit and completed into named settings.',
            example: positionalRelativeDateRepair,
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
            return resolveRelativeDateRule({
                expressionInput,
                rule,
                field,
                source,
            });
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return resolveCurrentDateRule({
                expressionInput,
                rule,
                field,
                source,
            });
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
                expressionInput,
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

type ExpressionConnector = NonNullable<FilterExpressionAst['connector']>;

type SyntaxParseError = Extract<
    FilterExpressionParseError,
    {
        code: 'FILTER_EXPRESSION_SYNTAX' | 'FILTER_EXPRESSION_MIXED_CONNECTORS';
    }
>;

type SyntaxRepair =
    | { kind: 'missingValue'; operator: FilterOperator; example: string }
    | { kind: 'trailingComma'; example: string }
    | { kind: 'parenthesizedLiteral'; example: string }
    | { kind: 'invalidEscape'; sequence: string; example: string }
    | { kind: 'settingSeparator'; example: string }
    | { kind: 'mixedConnectors'; example: string }
    | { kind: 'malformed' };

type RepairDetails = {
    problem: string;
    guidance: string;
    example: string;
};

const isRepairExpressionValid = ({
    expression,
    expressionInput,
    fields,
    source,
}: {
    expression: FilterExpressionAst;
    expressionInput: string;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): boolean => {
    if (source.kind === 'customMetricFilter' && expression.connector === 'or') {
        return false;
    }

    return expression.rules.every(
        (rule) =>
            resolveRule({ expressionInput, rule, fields, source }).success,
    );
};

const validateRepairCandidate = ({
    candidate,
    fields,
    source,
}: {
    candidate: string;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): FilterExpressionAst | null => {
    const parsed = parseFilterExpression(candidate);
    if (!parsed.success) return null;
    return isRepairExpressionValid({
        expression: parsed.expression,
        expressionInput: candidate,
        fields,
        source,
    })
        ? parsed.expression
        : null;
};

const replaceRuleField = ({
    input,
    rule,
    fieldId,
}: {
    input: string;
    rule: FilterExpressionRule;
    fieldId: string;
}): string =>
    `${input.slice(0, rule.field.span.start.offset)}${formatFieldId(fieldId)}${input.slice(rule.field.span.end.offset)}`;

const resolveRuleWithRepair = ({
    rule,
    fields,
    source,
    input,
}: {
    rule: FilterExpressionRule;
    fields: ResolvedField[];
    source: FilterExpressionSource;
    input: string;
}): ResolutionResult<RawFilterRule> => {
    const result = resolveRule({
        expressionInput: input,
        rule,
        fields,
        source,
    });
    if (
        result.success ||
        result.error.code !== 'FILTER_EXPRESSION_UNKNOWN_FIELD'
    ) {
        return result;
    }

    const suggestedField = result.error.suggestedFields[0];
    if (!suggestedField) return result;

    const candidate = replaceRuleField({
        input,
        rule,
        fieldId: suggestedField.fieldId,
    });
    return failure({
        ...result.error,
        example: validateRepairCandidate({ candidate, fields, source })
            ? candidate
            : null,
    });
};

const getRuleField = ({
    rule,
    fields,
    source,
}: {
    rule: FilterExpressionRule;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): ResolvedField | null => {
    const matches = getFieldMatches(fields, rule.field.value);
    if (matches.length !== 1) return null;
    const field = matches[0];
    if (!field || !isFieldInSourceCategory(field, source)) return null;
    if (
        field.category === 'tableCalculations' &&
        field.filterType !== FilterType.NUMBER
    ) {
        return null;
    }
    return field;
};

const repairTrailingComma = ({
    expression,
    fields,
    source,
}: {
    expression: string;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): SyntaxRepair | null => {
    const trimmedExpression = expression.trimEnd();
    if (!trimmedExpression.endsWith(',')) return null;
    const withoutComma = trimmedExpression.slice(0, -1).trimEnd();
    const parsed = parseFilterExpression(withoutComma);
    if (!parsed.success) return null;
    const rule = parsed.expression.rules.at(-1);
    if (!rule) return null;
    const field = getRuleField({ rule, fields, source });
    if (!field) return null;
    if (validateRepairCandidate({ candidate: withoutComma, fields, source })) {
        return { kind: 'trailingComma', example: withoutComma };
    }
    const withAnotherValue = `${trimmedExpression}${illustrativeValue(field.filterType)}`;
    return validateRepairCandidate({
        candidate: withAnotherValue,
        fields,
        source,
    })
        ? { kind: 'trailingComma', example: withAnotherValue }
        : null;
};

const repairMissingValue = ({
    expression,
    error,
    fields,
    source,
}: {
    expression: string;
    error: SyntaxParseError;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): SyntaxRepair | null => {
    if (
        error.span.start.offset !== expression.length ||
        !expression.trimEnd().endsWith('=')
    ) {
        return null;
    }

    const probe = parseFilterExpression(`${expression}"example value"`);
    if (!probe.success) return null;
    const rule = probe.expression.rules.at(-1);
    if (!rule) return null;
    const field = getRuleField({ rule, fields, source });
    if (!field) return null;
    const args = exampleArguments(rule.operator.value, field.filterType);
    if (args === null) return null;
    const candidate = `${expression}${args}`;
    return validateRepairCandidate({ candidate, fields, source })
        ? {
              kind: 'missingValue',
              operator: rule.operator.value,
              example: candidate,
          }
        : null;
};

const repairParenthesizedLiteral = ({
    expression,
    error,
    fields,
    source,
}: {
    expression: string;
    error: SyntaxParseError;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): SyntaxRepair | null => {
    const start = error.span.start.offset;
    const end = expression.trimEnd().length;
    if (expression[start] !== '(' || expression[end - 1] !== ')') return null;
    const literal = expression.slice(start, end);
    const candidate = `${expression.slice(0, start)}${JSON.stringify(literal)}${expression.slice(end)}`;
    return validateRepairCandidate({ candidate, fields, source })
        ? { kind: 'parenthesizedLiteral', example: candidate }
        : null;
};

const repairInvalidEscape = ({
    expression,
    error,
    fields,
    source,
}: {
    expression: string;
    error: SyntaxParseError;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): SyntaxRepair | null => {
    const { span } = error;
    const { offset } = span.start;
    if (offset === 0 || expression[offset - 1] !== '\\') return null;
    const sequence = expression.slice(offset - 1, span.end.offset);
    const candidate = `${expression.slice(0, offset)}\\${expression.slice(offset)}`;
    return validateRepairCandidate({ candidate, fields, source })
        ? { kind: 'invalidEscape', sequence, example: candidate }
        : null;
};

const repairSettingSeparator = ({
    expression,
    error,
    fields,
    source,
}: {
    expression: string;
    error: SyntaxParseError;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): SyntaxRepair | null => {
    const { offset } = error.span.start;
    if (expression[offset] !== '=') return null;
    const candidate = `${expression.slice(0, offset)}:${expression.slice(offset + 1)}`;
    const parsed = validateRepairCandidate({ candidate, fields, source });
    if (!parsed) return null;
    const separatorIsSetting = parsed.rules.some(
        ({ settings }) =>
            settings?.entries.some(
                ({ name, value }) =>
                    name.span.end.offset <= offset &&
                    value.span.start.offset > offset,
            ) ?? false,
    );
    return separatorIsSetting
        ? { kind: 'settingSeparator', example: candidate }
        : null;
};

const parseConnector = (value: string): ExpressionConnector | null => {
    switch (value.toLowerCase()) {
        case 'and':
            return 'and';
        case 'or':
            return 'or';
        default:
            return null;
    }
};

const otherConnector = (
    connector: ExpressionConnector,
): ExpressionConnector => {
    switch (connector) {
        case 'and':
            return 'or';
        case 'or':
            return 'and';
        default:
            return assertUnreachable(connector, 'Unknown expression connector');
    }
};

const connectorKeyword = (connector: ExpressionConnector): 'AND' | 'OR' => {
    switch (connector) {
        case 'and':
            return 'AND';
        case 'or':
            return 'OR';
        default:
            return assertUnreachable(connector, 'Unknown expression connector');
    }
};

const repairMixedConnectors = ({
    expression,
    error,
    fields,
    source,
}: {
    expression: string;
    error: SyntaxParseError;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): string | null => {
    let candidate = expression;
    let currentError: FilterExpressionParseError = error;
    let targetConnector: ExpressionConnector | null = null;

    for (
        let attempts = 0;
        attempts < FILTER_EXPRESSION_MAX_RULES;
        attempts += 1
    ) {
        if (currentError.code !== 'FILTER_EXPRESSION_MIXED_CONNECTORS') {
            return null;
        }
        const conflictingConnector = parseConnector(
            candidate.slice(
                currentError.span.start.offset,
                currentError.span.end.offset,
            ),
        );
        if (!conflictingConnector) return null;
        targetConnector ??= otherConnector(conflictingConnector);
        candidate = `${candidate.slice(0, currentError.span.start.offset)}${connectorKeyword(targetConnector)}${candidate.slice(currentError.span.end.offset)}`;

        const parsed = parseFilterExpression(candidate);
        if (parsed.success) {
            return isRepairExpressionValid({
                expression: parsed.expression,
                expressionInput: candidate,
                fields,
                source,
            })
                ? candidate
                : null;
        }
        currentError = parsed.error;
    }

    return null;
};

const getSyntaxRepair = ({
    expression,
    error,
    fields,
    source,
}: {
    expression: string;
    error: SyntaxParseError;
    fields: ResolvedField[];
    source: FilterExpressionSource;
}): SyntaxRepair => {
    switch (error.code) {
        case 'FILTER_EXPRESSION_MIXED_CONNECTORS':
            return {
                kind: 'mixedConnectors',
                example:
                    repairMixedConnectors({
                        expression,
                        error,
                        fields,
                        source,
                    }) ?? scopedExample(source, fields),
            };
        case 'FILTER_EXPRESSION_SYNTAX': {
            const trailingComma = repairTrailingComma({
                expression,
                fields,
                source,
            });
            if (trailingComma) return trailingComma;
            const missingValue = repairMissingValue({
                expression,
                error,
                fields,
                source,
            });
            if (missingValue) return missingValue;
            const parenthesizedLiteral = repairParenthesizedLiteral({
                expression,
                error,
                fields,
                source,
            });
            if (parenthesizedLiteral) return parenthesizedLiteral;
            const invalidEscape = repairInvalidEscape({
                expression,
                error,
                fields,
                source,
            });
            if (invalidEscape) return invalidEscape;
            const settingSeparator = repairSettingSeparator({
                expression,
                error,
                fields,
                source,
            });
            return settingSeparator ?? { kind: 'malformed' };
        }
        default:
            return assertUnreachable(error.code, 'Unknown syntax error');
    }
};

const mixedConnectorGuidance = (source: FilterExpressionSource): string => {
    switch (source.kind) {
        case 'queryFilter':
            return 'Use only one connector throughout: `fieldId operator=value AND fieldId2 operator=value2 AND ...`, or `fieldId operator=value OR fieldId2 operator=value2 OR ...`. The ellipsis represents more rules, not literal syntax.';
        case 'customMetricFilter':
            return 'Use only `AND` throughout: `fieldId operator=value AND fieldId2 operator=value2 AND ...`. The ellipsis represents more rules, not literal syntax.';
        default:
            return assertUnreachable(source, 'Unknown expression source');
    }
};

const getRepairDetails = ({
    repair,
    error,
    source,
    fields,
}: {
    repair: SyntaxRepair;
    error: SyntaxParseError;
    source: FilterExpressionSource;
    fields: ResolvedField[];
}): RepairDetails => {
    switch (repair.kind) {
        case 'missingValue':
            return {
                problem: `\`${repair.operator}\` is missing a value after \`=\`.`,
                guidance: 'Add a value after `=`; quote string values.',
                example: repair.example,
            };
        case 'trailingComma':
            return {
                problem: 'The trailing comma is missing another value.',
                guidance:
                    'Add another value after the trailing comma, or remove the comma if the list is complete.',
                example: repair.example,
            };
        case 'parenthesizedLiteral':
            return {
                problem:
                    'Parentheses are syntax punctuation in unquoted values.',
                guidance:
                    'Quote the whole literal when parentheses are part of the value.',
                example: repair.example,
            };
        case 'invalidEscape':
            return {
                problem: `The escape sequence \`${repair.sequence}\` is unsupported.`,
                guidance:
                    'Escape a literal backslash as `\\\\`, or remove the backslash.',
                example: repair.example,
            };
        case 'settingSeparator':
            return {
                problem:
                    'Named settings use `:` between each name and value, not `=`.',
                guidance: 'Replace the setting separator with `:`.',
                example: repair.example,
            };
        case 'mixedConnectors':
            return {
                problem: 'This expression mixes AND and OR connectors.',
                guidance: mixedConnectorGuidance(source),
                example: repair.example,
            };
        case 'malformed':
            return {
                problem: `The expression is malformed near line ${error.span.start.line}, column ${error.span.start.column}.`,
                guidance:
                    'Use field operator=value rules joined by only AND or only OR; quote values that contain punctuation.',
                example: scopedExample(source, fields),
            };
        default:
            return assertUnreachable(repair, 'Unknown syntax repair');
    }
};

type BoundsParseError = Extract<
    FilterExpressionParseError,
    { code: 'FILTER_EXPRESSION_BOUNDS_EXCEEDED' }
>;

const boundsGuidance = ({ limit, maximum }: BoundsParseError): string => {
    switch (limit) {
        case 'expressionLength':
            return `Shorten the expression to at most ${maximum} characters, using fewer rules or shorter values.`;
        case 'ruleCount':
            return `Reduce the expression to at most ${maximum} rules.`;
        case 'valueCount':
            return `Reduce this rule to at most ${maximum} values.`;
        case 'literalLength':
            return `Shorten this literal to at most ${maximum} characters.`;
        default:
            return assertUnreachable(
                limit,
                `Unknown filter expression limit: ${limit}`,
            );
    }
};

const parserError = ({
    expression,
    source,
    fields,
    error,
}: {
    expression: string;
    source: FilterExpressionSource;
    fields: ResolvedField[];
    error: FilterExpressionParseError;
}): FilterExpressionResolutionError => {
    switch (error.code) {
        case 'FILTER_EXPRESSION_SYNTAX':
        case 'FILTER_EXPRESSION_MIXED_CONNECTORS': {
            const repair = getSyntaxRepair({
                expression,
                error,
                fields,
                source,
            });
            return {
                code: error.code,
                source,
                span: error.span,
                parserMessage: error.message,
                ...getRepairDetails({ repair, error, source, fields }),
            };
        }
        case 'FILTER_EXPRESSION_BOUNDS_EXCEEDED':
            return {
                code: error.code,
                source,
                span: error.span,
                limit: error.limit,
                maximum: error.maximum,
                actual: error.actual,
                problem: error.message,
                guidance: boundsGuidance(error),
                example: null,
            };
        default:
            return assertUnreachable(error, 'Unknown parser error');
    }
};

const parseExpression = (
    expression: string,
    source: FilterExpressionSource,
    fields: ResolvedField[],
): ResolutionResult<FilterExpressionAst> => {
    const parsed = parseFilterExpression(expression);
    return parsed.success
        ? success(parsed.expression)
        : failure(
              parserError({ expression, source, fields, error: parsed.error }),
          );
};

const resolveCustomMetrics = ({
    customMetrics,
    tableCalculations,
    explore,
}: {
    customMetrics: ExpressionQueryConfig['customMetrics'];
    tableCalculations: ExpressionQueryConfig['tableCalculations'];
    explore: Parameters<typeof getFields>[0];
}): ResolutionResult<{
    raw: unknown;
    transformed: ReturnType<typeof customMetricsSchemaTransformed.parse>;
}> => {
    if (!customMetrics) {
        return success({ raw: null, transformed: null });
    }

    const fields = [
        ...makeExploreFields(explore),
        ...makeTableCalculationFields(tableCalculations),
    ];
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
            const parsedResult = parseExpression(
                customMetric.filters,
                source,
                fields,
            );
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
                        'Custom metric filters support AND only. Keep only rules that should all apply together, or remove the filters.',
                    example: null,
                });
            }

            const filters: { table: string; filter: RawFilterRule }[] = [];
            for (const rule of expression.rules) {
                const ruleResult = resolveRuleWithRepair({
                    rule,
                    fields,
                    source,
                    input: customMetric.filters,
                });
                if (!ruleResult.success) return ruleResult;
                const fieldResult = resolveField({
                    expressionInput: customMetric.filters,
                    fields,
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
            const parsedResult = parseExpression(
                expressionInput,
                source,
                fields,
            );
            if (!parsedResult.success) return parsedResult;
            const expression = parsedResult.data;

            const categoryRules: RawFilterRule[] = [];
            for (const rule of expression.rules) {
                const ruleResult = resolveRuleWithRepair({
                    rule,
                    fields,
                    source,
                    input: expressionInput,
                });
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
        tableCalculations: queryConfig.tableCalculations,
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
