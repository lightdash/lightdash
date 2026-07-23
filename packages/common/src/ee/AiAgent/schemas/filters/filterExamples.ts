import { DimensionType, MetricType } from '../../../../types/field';
import {
    FilterOperator,
    FilterType,
    UnitOfTime,
} from '../../../../types/filter';
import assertUnreachable from '../../../../utils/assertUnreachable';

export type AiFilterExample = {
    fieldId: string;
    fieldType: string;
    fieldFilterType: FilterType;
    operator: FilterOperator;
    values?: unknown[];
    settings?: {
        completed: boolean;
        unitOfTime: UnitOfTime;
    };
};

type FilterExampleTemplate = Omit<
    AiFilterExample,
    'fieldId' | 'fieldType' | 'fieldFilterType'
>;

type GetFilterExamplesArgs = {
    fieldId: string;
    fieldType: string;
    fieldFilterType: FilterType;
    operators?: FilterOperator[];
};

const booleanFilterExampleTemplates: FilterExampleTemplate[] = [
    { operator: FilterOperator.NULL },
    { operator: FilterOperator.NOT_NULL },
    { operator: FilterOperator.EQUALS, values: [true] },
    { operator: FilterOperator.NOT_EQUALS, values: [false] },
];

const stringFilterExampleTemplates: FilterExampleTemplate[] = [
    { operator: FilterOperator.NULL },
    { operator: FilterOperator.NOT_NULL },
    { operator: FilterOperator.EQUALS, values: ['example'] },
    { operator: FilterOperator.NOT_EQUALS, values: ['excluded'] },
    { operator: FilterOperator.STARTS_WITH, values: ['prefix'] },
    { operator: FilterOperator.ENDS_WITH, values: ['suffix'] },
    { operator: FilterOperator.INCLUDE, values: ['contains'] },
    { operator: FilterOperator.NOT_INCLUDE, values: ['exclude'] },
];

const numberFilterExampleTemplates: FilterExampleTemplate[] = [
    { operator: FilterOperator.NULL },
    { operator: FilterOperator.NOT_NULL },
    { operator: FilterOperator.EQUALS, values: [100] },
    { operator: FilterOperator.NOT_EQUALS, values: [100] },
    { operator: FilterOperator.LESS_THAN, values: [100] },
    { operator: FilterOperator.LESS_THAN_OR_EQUAL, values: [100] },
    { operator: FilterOperator.GREATER_THAN, values: [100] },
    { operator: FilterOperator.GREATER_THAN_OR_EQUAL, values: [100] },
    { operator: FilterOperator.IN_BETWEEN, values: [100, 500] },
    { operator: FilterOperator.NOT_IN_BETWEEN, values: [100, 500] },
];

const dateRelativeUnits = [
    UnitOfTime.days,
    UnitOfTime.weeks,
    UnitOfTime.months,
    UnitOfTime.quarters,
    UnitOfTime.years,
] as const;

const dateRelativeFilterExampleTemplates: FilterExampleTemplate[] = [
    FilterOperator.IN_THE_PAST,
    FilterOperator.NOT_IN_THE_PAST,
    FilterOperator.IN_THE_NEXT,
].flatMap((operator) =>
    dateRelativeUnits.flatMap((unitOfTime) =>
        [false, true].map((completed) => ({
            operator,
            values: [2],
            settings: { completed, unitOfTime },
        })),
    ),
);

const dateCurrentFilterExampleTemplates: FilterExampleTemplate[] = [
    FilterOperator.IN_THE_CURRENT,
    FilterOperator.NOT_IN_THE_CURRENT,
].flatMap((operator) =>
    dateRelativeUnits.map((unitOfTime) => ({
        operator,
        values: [1],
        settings: { completed: false, unitOfTime },
    })),
);

const dateFilterExampleTemplates: FilterExampleTemplate[] = [
    { operator: FilterOperator.NULL },
    { operator: FilterOperator.NOT_NULL },
    { operator: FilterOperator.EQUALS, values: ['2024-01-01'] },
    {
        operator: FilterOperator.NOT_EQUALS,
        values: ['2024-01-01T00:00:00Z'],
    },
    ...dateRelativeFilterExampleTemplates,
    ...dateCurrentFilterExampleTemplates,
    { operator: FilterOperator.LESS_THAN, values: ['2024-02-01T00:00:00Z'] },
    {
        operator: FilterOperator.LESS_THAN_OR_EQUAL,
        values: ['2024-02-01'],
    },
    { operator: FilterOperator.GREATER_THAN, values: ['2024-01-01'] },
    {
        operator: FilterOperator.GREATER_THAN_OR_EQUAL,
        values: ['2024-01-01'],
    },
    {
        operator: FilterOperator.IN_BETWEEN,
        values: ['2024-01-01', '2024-01-31'],
    },
];

const getFilterExampleTemplates = (
    fieldFilterType: FilterType,
): FilterExampleTemplate[] => {
    switch (fieldFilterType) {
        case FilterType.BOOLEAN:
            return booleanFilterExampleTemplates;
        case FilterType.STRING:
            return stringFilterExampleTemplates;
        case FilterType.NUMBER:
            return numberFilterExampleTemplates;
        case FilterType.DATE:
            return dateFilterExampleTemplates;
        default:
            return assertUnreachable(
                fieldFilterType,
                `Unknown filter type ${fieldFilterType}`,
            );
    }
};

export const getFilterExamples = ({
    fieldId,
    fieldType,
    fieldFilterType,
    operators,
}: GetFilterExamplesArgs): AiFilterExample[] => {
    const allowedOperators = operators ? new Set(operators) : null;

    return getFilterExampleTemplates(fieldFilterType)
        .filter(
            (template) =>
                allowedOperators === null ||
                allowedOperators.has(template.operator),
        )
        .map((template) => ({
            fieldId,
            fieldType,
            fieldFilterType,
            ...template,
        }));
};

export const formatFilterExamplesInline = (
    examples: AiFilterExample[],
): string => examples.map((example) => JSON.stringify(example)).join('; ');

export const formatFilterExamplesAsJsonLines = (
    examples: AiFilterExample[],
): string => examples.map((example) => JSON.stringify(example)).join('\n');

const literalUnion = (values: unknown[]): string =>
    Array.from(new Set(values.map((value) => JSON.stringify(value)))).join(
        ' | ',
    );

const enumValuesList = (...enumValues: object[]): string =>
    Array.from(
        new Set(
            enumValues.flatMap((values) =>
                Object.values(values).filter(
                    (value): value is string => typeof value === 'string',
                ),
            ),
        ),
    ).join(', ');

const validFieldTypes = enumValuesList(DimensionType, MetricType);
const validFieldFilterTypes = enumValuesList(FilterType);

type SupportedExamplePrimitive = boolean | number | string;

type SupportedExamplePrimitiveName = 'boolean' | 'number' | 'string';

const isSupportedExamplePrimitive = (
    value: unknown,
): value is SupportedExamplePrimitive =>
    ['boolean', 'number', 'string'].includes(typeof value);

const primitiveName = (
    value: SupportedExamplePrimitive,
): SupportedExamplePrimitiveName => {
    switch (typeof value) {
        case 'boolean':
            return 'boolean';
        case 'number':
            return 'number';
        case 'string':
            return 'string';
        default:
            return assertUnreachable(
                value,
                `Unsupported example value type: ${typeof value}`,
            );
    }
};

const valuesTypeForOperator = (
    operator: FilterOperator,
    primitive: SupportedExamplePrimitiveName | 'unknown',
): string | null => {
    switch (operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return null;
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
            return primitive === 'boolean' ? '[boolean]' : `${primitive}[]`;
        case FilterOperator.STARTS_WITH:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
            return 'string[]';
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return `[${primitive}]`;
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            return `[${primitive}, ${primitive}]`;
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return '[1]';
        case FilterOperator.IN_PERIOD_TO_DATE:
            return null;
        default:
            return assertUnreachable(
                operator,
                `Unsupported filter operator: ${operator}`,
            );
    }
};

const valuesTypeForExamples = (examples: AiFilterExample[]): string | null => {
    const valuesExample = examples.find((example) => example.values)?.values;
    if (!valuesExample) return null;

    const firstValue = valuesExample[0];
    const primitive = isSupportedExamplePrimitive(firstValue)
        ? primitiveName(firstValue)
        : 'unknown';
    const valueTypes = new Set(
        examples
            .map((example) =>
                valuesTypeForOperator(example.operator, primitive),
            )
            .filter((valueType) => valueType !== null),
    );

    return Array.from(valueTypes).join(' | ');
};

const valuesCommentForOperator = (
    operator: FilterOperator,
    primitive: SupportedExamplePrimitiveName | 'unknown',
): string => {
    switch (operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
        case FilterOperator.IN_PERIOD_TO_DATE:
            return '';
        case FilterOperator.EQUALS:
        case FilterOperator.NOT_EQUALS:
            return primitive === 'boolean' ? ' // exactly one array value' : '';
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT:
            return ' // exactly one array value; always [1] for current-period filters';
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT:
            return ' // exactly one array value; number of periods';
        case FilterOperator.IN_BETWEEN:
        case FilterOperator.NOT_IN_BETWEEN:
            return ' // exactly two array values; lower and upper bounds';
        case FilterOperator.LESS_THAN:
        case FilterOperator.LESS_THAN_OR_EQUAL:
        case FilterOperator.GREATER_THAN:
        case FilterOperator.GREATER_THAN_OR_EQUAL:
            return ' // exactly one array value';
        case FilterOperator.STARTS_WITH:
        case FilterOperator.ENDS_WITH:
        case FilterOperator.INCLUDE:
        case FilterOperator.NOT_INCLUDE:
            return '';
        default:
            return assertUnreachable(
                operator,
                `Unsupported filter operator: ${operator}`,
            );
    }
};

const valuesCommentForExamples = (examples: AiFilterExample[]): string => {
    const valuesExample = examples.find((example) => example.values)?.values;
    if (!valuesExample) return '';

    const firstValue = valuesExample[0];
    const primitive = isSupportedExamplePrimitive(firstValue)
        ? primitiveName(firstValue)
        : 'unknown';
    const comments = new Set(
        examples
            .map((example) =>
                valuesCommentForOperator(example.operator, primitive),
            )
            .filter((comment) => comment !== ''),
    );

    return Array.from(comments).join(' | ');
};

const settingsTypeForExamples = (
    examples: AiFilterExample[],
): string | null => {
    const settingsExamples = examples
        .map((example) => example.settings)
        .filter((settings) => settings !== undefined);

    if (settingsExamples.length === 0) return null;

    return `{
  completed: ${literalUnion(settingsExamples.map((settings) => settings.completed))}; // false includes current partial period; true means completed periods only
  unitOfTime: ${literalUnion(settingsExamples.map((settings) => settings.unitOfTime))};
}`;
};

export const formatFilterExamplesAsTypeDeclaration = (
    examples: AiFilterExample[],
): string => {
    const firstExample = examples[0];
    if (!firstExample) return '{}';

    const valuesType = valuesTypeForExamples(examples);
    const settingsType = settingsTypeForExamples(examples);

    return `{
  fieldId: "${firstExample.fieldId}"; // use the actual field id
  fieldType: "${firstExample.fieldType}"; // one of: ${validFieldTypes}
  fieldFilterType: "${firstExample.fieldFilterType}"; // one of: ${validFieldFilterTypes}; used to choose valid operators
  operator: ${literalUnion(examples.map((example) => example.operator))}; // | means or${
      valuesType
          ? `
  values: ${valuesType};${valuesCommentForExamples(examples)}`
          : ''
  }${
      settingsType
          ? `
  settings: ${settingsType};`
          : ''
  }
}`;
};

export const filterJsonExamplesForOperators = (
    args: GetFilterExamplesArgs & { operators: FilterOperator[] },
): string =>
    `Type shape: ${formatFilterExamplesAsTypeDeclaration(
        getFilterExamples(args),
    )}`;
