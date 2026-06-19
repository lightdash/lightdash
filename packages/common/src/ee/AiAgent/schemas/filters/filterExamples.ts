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

export const filterJsonExamplesForOperators = (
    args: GetFilterExamplesArgs & { operators: FilterOperator[] },
): string => `Examples: ${formatFilterExamplesInline(getFilterExamples(args))}`;
