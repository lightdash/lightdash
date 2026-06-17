import {
    DimensionType,
    FilterOperator,
    FilterType,
    MetricType,
    UnitOfTime,
} from '@lightdash/common';

export type FilterFamily = 'boolean' | 'string' | 'number' | 'date';

export type FieldCatalogEntry = {
    label: string;
    fieldType: DimensionType | MetricType;
    fieldFilterType: FilterType;
};

export type ExpectedFilter = {
    fieldId: string;
    fieldType: DimensionType | MetricType;
    fieldFilterType: FilterType;
    operator: FilterOperator;
    values?: unknown[];
    settings?: {
        completed?: boolean;
        unitOfTime?: UnitOfTime;
    };
};

export type LlmPermutationCase = {
    id: string;
    family: FilterFamily;
    permutation: string;
    prompt: string;
    expected: ExpectedFilter;
};

export const fieldCatalog = {
    users_name: {
        label: 'User name',
        fieldType: DimensionType.STRING,
        fieldFilterType: FilterType.STRING,
    },
    users_status: {
        label: 'User status',
        fieldType: DimensionType.STRING,
        fieldFilterType: FilterType.STRING,
    },
    users_segment_metric: {
        label: 'User segment metric',
        fieldType: MetricType.STRING,
        fieldFilterType: FilterType.STRING,
    },
    orders_created_date: {
        label: 'Order created date',
        fieldType: DimensionType.DATE,
        fieldFilterType: FilterType.DATE,
    },
    orders_created_timestamp: {
        label: 'Order created timestamp',
        fieldType: DimensionType.TIMESTAMP,
        fieldFilterType: FilterType.DATE,
    },
    orders_paid_at_metric: {
        label: 'Order paid at metric',
        fieldType: MetricType.TIMESTAMP,
        fieldFilterType: FilterType.DATE,
    },
    orders_total_amount: {
        label: 'Order total amount',
        fieldType: DimensionType.NUMBER,
        fieldFilterType: FilterType.NUMBER,
    },
    orders_count: {
        label: 'Order count',
        fieldType: MetricType.COUNT,
        fieldFilterType: FilterType.NUMBER,
    },
    orders_average_amount: {
        label: 'Average order amount',
        fieldType: MetricType.AVERAGE,
        fieldFilterType: FilterType.NUMBER,
    },
    users_is_active: {
        label: 'User is active',
        fieldType: DimensionType.BOOLEAN,
        fieldFilterType: FilterType.BOOLEAN,
    },
    users_has_discount_metric: {
        label: 'User has discount metric',
        fieldType: MetricType.BOOLEAN,
        fieldFilterType: FilterType.BOOLEAN,
    },
} as const satisfies Record<string, FieldCatalogEntry>;

type FieldId = keyof typeof fieldCatalog;

type CaseSeed = {
    id: string;
    family: FilterFamily;
    fieldId: FieldId;
    operator: FilterOperator;
    values?: unknown[];
    settings?: ExpectedFilter['settings'];
    prompt: string;
};

const caseFromSeed = (seed: CaseSeed): LlmPermutationCase => {
    const field = fieldCatalog[seed.fieldId];
    const valueKey = seed.values
        ? JSON.stringify(seed.values)
        : 'values omitted';
    const settingsKey = seed.settings
        ? JSON.stringify(seed.settings)
        : 'settings omitted';

    return {
        id: `${seed.family}.${seed.operator}.${seed.id}`,
        family: seed.family,
        permutation: `${seed.family} + ${seed.operator} + ${valueKey} + ${settingsKey}`,
        prompt: seed.prompt,
        expected: {
            fieldId: seed.fieldId,
            fieldType: field.fieldType,
            fieldFilterType: field.fieldFilterType,
            operator: seed.operator,
            ...(seed.values ? { values: seed.values } : {}),
            ...(seed.settings ? { settings: seed.settings } : {}),
        },
    };
};

const booleanSeeds: CaseSeed[] = [
    {
        id: 'dimension_missing',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.NULL,
        prompt: 'Find users where the active flag is missing.',
    },
    {
        id: 'metric_missing',
        family: 'boolean',
        fieldId: 'users_has_discount_metric',
        operator: FilterOperator.NULL,
        prompt: 'Find users where the discount metric flag is null.',
    },
    {
        id: 'active_unknown',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.NULL,
        prompt: 'Find users with no value recorded for whether they are active.',
    },
    {
        id: 'dimension_present',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find users where the active flag is present.',
    },
    {
        id: 'metric_present',
        family: 'boolean',
        fieldId: 'users_has_discount_metric',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find users where the discount metric flag has a value.',
    },
    {
        id: 'active_known',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find users where whether they are active is known.',
    },
    {
        id: 'true_dimension',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.EQUALS,
        values: [true],
        prompt: 'Find users where is active equals true.',
    },
    {
        id: 'false_dimension',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.EQUALS,
        values: [false],
        prompt: 'Find users where is active equals false.',
    },
    {
        id: 'true_metric',
        family: 'boolean',
        fieldId: 'users_has_discount_metric',
        operator: FilterOperator.EQUALS,
        values: [true],
        prompt: 'Find users where the discount metric flag equals true.',
    },
    {
        id: 'not_true_dimension',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.NOT_EQUALS,
        values: [true],
        prompt: 'Find users where is active is not true.',
    },
    {
        id: 'not_false_dimension',
        family: 'boolean',
        fieldId: 'users_is_active',
        operator: FilterOperator.NOT_EQUALS,
        values: [false],
        prompt: 'Find users where is active is not false.',
    },
    {
        id: 'not_false_metric',
        family: 'boolean',
        fieldId: 'users_has_discount_metric',
        operator: FilterOperator.NOT_EQUALS,
        values: [false],
        prompt: 'Find users where the discount metric flag is not false.',
    },
];

const stringValueExamples = [
    {
        id: 'single_value',
        fieldId: 'users_status' as const,
        value: ['active'],
        phrase: 'status value active',
    },
    {
        id: 'multiple_values',
        fieldId: 'users_status' as const,
        value: ['active', 'pending'],
        phrase: 'status values active or pending',
    },
    {
        id: 'metric_punctuation',
        fieldId: 'users_segment_metric' as const,
        value: ['Enterprise - West'],
        phrase: 'segment metric value Enterprise - West',
    },
];

const stringOperatorPhrases: Record<
    | FilterOperator.EQUALS
    | FilterOperator.NOT_EQUALS
    | FilterOperator.STARTS_WITH
    | FilterOperator.ENDS_WITH
    | FilterOperator.INCLUDE
    | FilterOperator.NOT_INCLUDE,
    string
> = {
    [FilterOperator.EQUALS]: 'equals',
    [FilterOperator.NOT_EQUALS]: 'does not equal',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.ENDS_WITH]: 'ends with',
    [FilterOperator.INCLUDE]: 'contains',
    [FilterOperator.NOT_INCLUDE]: 'does not contain',
};

const stringSeeds: CaseSeed[] = [
    {
        id: 'name_missing',
        family: 'string',
        fieldId: 'users_name',
        operator: FilterOperator.NULL,
        prompt: 'Find users where the user name is missing.',
    },
    {
        id: 'status_missing',
        family: 'string',
        fieldId: 'users_status',
        operator: FilterOperator.NULL,
        prompt: 'Find users where status is null.',
    },
    {
        id: 'metric_missing',
        family: 'string',
        fieldId: 'users_segment_metric',
        operator: FilterOperator.NULL,
        prompt: 'Find users where the segment metric has no value.',
    },
    {
        id: 'name_present',
        family: 'string',
        fieldId: 'users_name',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find users where the user name is present.',
    },
    {
        id: 'status_present',
        family: 'string',
        fieldId: 'users_status',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find users where status is not null.',
    },
    {
        id: 'metric_present',
        family: 'string',
        fieldId: 'users_segment_metric',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find users where the segment metric has a value.',
    },
    ...(
        [
            FilterOperator.EQUALS,
            FilterOperator.NOT_EQUALS,
            FilterOperator.STARTS_WITH,
            FilterOperator.ENDS_WITH,
            FilterOperator.INCLUDE,
            FilterOperator.NOT_INCLUDE,
        ] as const
    ).flatMap((operator) =>
        stringValueExamples.map<CaseSeed>((example) => ({
            id: `${operator}_${example.id}`,
            family: 'string',
            fieldId: example.fieldId,
            operator,
            values: example.value,
            prompt: `Find users where ${example.phrase} ${stringOperatorPhrases[operator]}.`,
        })),
    ),
];

const numberValueExamples = [
    {
        id: 'single_integer',
        fieldId: 'orders_total_amount' as const,
        values: [100],
        phrase: 'order total amount 100',
    },
    {
        id: 'multiple_values',
        fieldId: 'orders_count' as const,
        values: [1, 2, 3],
        phrase: 'order count values 1, 2, or 3',
    },
    {
        id: 'decimal_metric',
        fieldId: 'orders_average_amount' as const,
        values: [42.75],
        phrase: 'average order amount 42.75',
    },
];

const numberComparisonExamples = [
    {
        id: 'positive_dimension',
        fieldId: 'orders_total_amount' as const,
        values: [100],
        phrase: 'order total amount 100',
    },
    {
        id: 'negative_dimension',
        fieldId: 'orders_total_amount' as const,
        values: [-5],
        phrase: 'order total amount negative 5',
    },
    {
        id: 'decimal_metric',
        fieldId: 'orders_average_amount' as const,
        values: [42.75],
        phrase: 'average order amount 42.75',
    },
];

const numberRangeExamples = [
    {
        id: 'normal_range',
        fieldId: 'orders_total_amount' as const,
        values: [10, 100],
        phrase: 'order total amount from 10 to 100',
    },
    {
        id: 'negative_to_positive',
        fieldId: 'orders_total_amount' as const,
        values: [-10, 10],
        phrase: 'order total amount from negative 10 to 10',
    },
    {
        id: 'decimal_metric_range',
        fieldId: 'orders_average_amount' as const,
        values: [1.5, 9.75],
        phrase: 'average order amount from 1.5 to 9.75',
    },
];

const numberOperatorPhrases: Record<
    | FilterOperator.EQUALS
    | FilterOperator.NOT_EQUALS
    | FilterOperator.LESS_THAN
    | FilterOperator.LESS_THAN_OR_EQUAL
    | FilterOperator.GREATER_THAN
    | FilterOperator.GREATER_THAN_OR_EQUAL
    | FilterOperator.IN_BETWEEN
    | FilterOperator.NOT_IN_BETWEEN,
    string
> = {
    [FilterOperator.EQUALS]: 'equals',
    [FilterOperator.NOT_EQUALS]: 'does not equal',
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal to',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal to',
    [FilterOperator.IN_BETWEEN]: 'is between',
    [FilterOperator.NOT_IN_BETWEEN]: 'is outside the range',
};

const numberSeeds: CaseSeed[] = [
    {
        id: 'amount_missing',
        family: 'number',
        fieldId: 'orders_total_amount',
        operator: FilterOperator.NULL,
        prompt: 'Find orders where total amount is missing.',
    },
    {
        id: 'count_missing',
        family: 'number',
        fieldId: 'orders_count',
        operator: FilterOperator.NULL,
        prompt: 'Find orders where order count is null.',
    },
    {
        id: 'average_missing',
        family: 'number',
        fieldId: 'orders_average_amount',
        operator: FilterOperator.NULL,
        prompt: 'Find orders where average order amount has no value.',
    },
    {
        id: 'amount_present',
        family: 'number',
        fieldId: 'orders_total_amount',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find orders where total amount is present.',
    },
    {
        id: 'count_present',
        family: 'number',
        fieldId: 'orders_count',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find orders where order count is not null.',
    },
    {
        id: 'average_present',
        family: 'number',
        fieldId: 'orders_average_amount',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find orders where average order amount has a value.',
    },
    ...([FilterOperator.EQUALS, FilterOperator.NOT_EQUALS] as const).flatMap(
        (operator) =>
            numberValueExamples.map<CaseSeed>((example) => ({
                id: `${operator}_${example.id}`,
                family: 'number',
                fieldId: example.fieldId,
                operator,
                values: example.values,
                prompt: `Find orders where ${example.phrase} ${numberOperatorPhrases[operator]}.`,
            })),
    ),
    ...(
        [
            FilterOperator.LESS_THAN,
            FilterOperator.LESS_THAN_OR_EQUAL,
            FilterOperator.GREATER_THAN,
            FilterOperator.GREATER_THAN_OR_EQUAL,
        ] as const
    ).flatMap((operator) =>
        numberComparisonExamples.map<CaseSeed>((example) => ({
            id: `${operator}_${example.id}`,
            family: 'number',
            fieldId: example.fieldId,
            operator,
            values: example.values,
            prompt: `Find orders where ${example.phrase} ${numberOperatorPhrases[operator]}.`,
        })),
    ),
    ...(
        [FilterOperator.IN_BETWEEN, FilterOperator.NOT_IN_BETWEEN] as const
    ).flatMap((operator) =>
        numberRangeExamples.map<CaseSeed>((example) => ({
            id: `${operator}_${example.id}`,
            family: 'number',
            fieldId: example.fieldId,
            operator,
            values: example.values,
            prompt: `Find orders where ${example.phrase} ${numberOperatorPhrases[operator]}.`,
        })),
    ),
];

const explicitDateExamples = [
    {
        id: 'date_only',
        fieldId: 'orders_created_date' as const,
        values: ['2026-01-15'],
        phrase: 'created date 2026-01-15',
    },
    {
        id: 'datetime_only',
        fieldId: 'orders_created_timestamp' as const,
        values: ['2026-01-15T10:30:00Z'],
        phrase: 'created timestamp 2026-01-15T10:30:00Z',
    },
    {
        id: 'multiple_dates_metric',
        fieldId: 'orders_paid_at_metric' as const,
        values: ['2026-01-15', '2026-02-20T09:00:00Z'],
        phrase: 'paid-at metric values 2026-01-15 or 2026-02-20T09:00:00Z',
    },
];

const dateComparisonExamples = [
    {
        id: 'date_threshold',
        fieldId: 'orders_created_date' as const,
        values: ['2026-03-01'],
        phrase: 'created date 2026-03-01',
    },
    {
        id: 'datetime_threshold',
        fieldId: 'orders_created_timestamp' as const,
        values: ['2026-03-01T12:45:00Z'],
        phrase: 'created timestamp 2026-03-01T12:45:00Z',
    },
    {
        id: 'metric_datetime_threshold',
        fieldId: 'orders_paid_at_metric' as const,
        values: ['2026-04-05T08:00:00Z'],
        phrase: 'paid-at metric 2026-04-05T08:00:00Z',
    },
];

const dateRangeExamples = [
    {
        id: 'date_to_date',
        fieldId: 'orders_created_date' as const,
        values: ['2026-01-01', '2026-01-31'],
        phrase: 'created date between 2026-01-01 and 2026-01-31',
    },
    {
        id: 'datetime_to_datetime',
        fieldId: 'orders_created_timestamp' as const,
        values: ['2026-02-01T00:00:00Z', '2026-02-28T23:59:59Z'],
        phrase: 'created timestamp between 2026-02-01T00:00:00Z and 2026-02-28T23:59:59Z',
    },
    {
        id: 'date_to_datetime_metric',
        fieldId: 'orders_paid_at_metric' as const,
        values: ['2026-03-01', '2026-03-31T23:59:59Z'],
        phrase: 'paid-at metric between 2026-03-01 and 2026-03-31T23:59:59Z',
    },
];

const dateOperatorPhrases: Record<
    | FilterOperator.EQUALS
    | FilterOperator.NOT_EQUALS
    | FilterOperator.LESS_THAN
    | FilterOperator.LESS_THAN_OR_EQUAL
    | FilterOperator.GREATER_THAN
    | FilterOperator.GREATER_THAN_OR_EQUAL,
    string
> = {
    [FilterOperator.EQUALS]: 'equals',
    [FilterOperator.NOT_EQUALS]: 'does not equal',
    [FilterOperator.LESS_THAN]: 'is before',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is on or before',
    [FilterOperator.GREATER_THAN]: 'is after',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is on or after',
};

const unitOfTimeExamples: Record<UnitOfTime, { value: number; label: string }> =
    {
        [UnitOfTime.milliseconds]: { value: 3, label: 'milliseconds' },
        [UnitOfTime.seconds]: { value: 3, label: 'seconds' },
        [UnitOfTime.minutes]: { value: 3, label: 'minutes' },
        [UnitOfTime.hours]: { value: 3, label: 'hours' },
        [UnitOfTime.days]: { value: 3, label: 'days' },
        [UnitOfTime.weeks]: { value: 3, label: 'weeks' },
        [UnitOfTime.months]: { value: 3, label: 'months' },
        [UnitOfTime.quarters]: { value: 3, label: 'quarters' },
        [UnitOfTime.years]: { value: 3, label: 'years' },
    };

const aiDateUnits = [
    UnitOfTime.days,
    UnitOfTime.weeks,
    UnitOfTime.months,
    UnitOfTime.quarters,
    UnitOfTime.years,
] as const;

const relativeDatePrompts = [
    {
        id: 'plain_dimension',
        fieldId: 'orders_created_date' as const,
        phrase: 'created date',
    },
    {
        id: 'timestamp_dimension',
        fieldId: 'orders_created_timestamp' as const,
        phrase: 'created timestamp',
    },
    {
        id: 'metric_timestamp',
        fieldId: 'orders_paid_at_metric' as const,
        phrase: 'paid-at metric',
    },
];

const relativeOperatorPhrase = (
    operator:
        | FilterOperator.IN_THE_PAST
        | FilterOperator.NOT_IN_THE_PAST
        | FilterOperator.IN_THE_NEXT,
    completed: boolean,
    value: number,
    unit: UnitOfTime,
): string => {
    const period = `${value} ${unitOfTimeExamples[unit].label}`;
    switch (operator) {
        case FilterOperator.IN_THE_PAST:
            return completed
                ? `in the last ${period}, completed periods only`
                : `in the past ${period}, including the current partial period`;
        case FilterOperator.NOT_IN_THE_PAST:
            return completed
                ? `not in the last ${period}, completed periods only`
                : `not in the past ${period}, including the current partial period`;
        case FilterOperator.IN_THE_NEXT:
            return completed
                ? `in the next ${period}, completed periods only`
                : `in the next ${period}, including the current partial period`;
        default:
            return operator;
    }
};

const currentOperatorPhrase = (
    operator: FilterOperator.IN_THE_CURRENT | FilterOperator.NOT_IN_THE_CURRENT,
    unit: UnitOfTime,
): string => {
    switch (operator) {
        case FilterOperator.IN_THE_CURRENT:
            return `in the current ${unitOfTimeExamples[unit].label.slice(0, -1)}`;
        case FilterOperator.NOT_IN_THE_CURRENT:
            return `not in the current ${unitOfTimeExamples[unit].label.slice(0, -1)}`;
        default:
            return operator;
    }
};

const dateSeeds: CaseSeed[] = [
    {
        id: 'date_missing',
        family: 'date',
        fieldId: 'orders_created_date',
        operator: FilterOperator.NULL,
        prompt: 'Find orders where created date is missing.',
    },
    {
        id: 'timestamp_missing',
        family: 'date',
        fieldId: 'orders_created_timestamp',
        operator: FilterOperator.NULL,
        prompt: 'Find orders where created timestamp is null.',
    },
    {
        id: 'metric_missing',
        family: 'date',
        fieldId: 'orders_paid_at_metric',
        operator: FilterOperator.NULL,
        prompt: 'Find orders where paid-at metric has no value.',
    },
    {
        id: 'date_present',
        family: 'date',
        fieldId: 'orders_created_date',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find orders where created date is present.',
    },
    {
        id: 'timestamp_present',
        family: 'date',
        fieldId: 'orders_created_timestamp',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find orders where created timestamp is not null.',
    },
    {
        id: 'metric_present',
        family: 'date',
        fieldId: 'orders_paid_at_metric',
        operator: FilterOperator.NOT_NULL,
        prompt: 'Find orders where paid-at metric has a value.',
    },
    ...([FilterOperator.EQUALS, FilterOperator.NOT_EQUALS] as const).flatMap(
        (operator) =>
            explicitDateExamples.map<CaseSeed>((example) => ({
                id: `${operator}_${example.id}`,
                family: 'date',
                fieldId: example.fieldId,
                operator,
                values: example.values,
                prompt: `Find orders where ${example.phrase} ${dateOperatorPhrases[operator]}.`,
            })),
    ),
    ...(
        [
            FilterOperator.IN_THE_PAST,
            FilterOperator.NOT_IN_THE_PAST,
            FilterOperator.IN_THE_NEXT,
        ] as const
    ).flatMap((operator) =>
        aiDateUnits.flatMap((unit) =>
            [true, false].flatMap((completed) =>
                relativeDatePrompts.map<CaseSeed>((example) => ({
                    id: `${operator}_${completed ? 'completed' : 'rolling'}_${unit}_${example.id}`,
                    family: 'date',
                    fieldId: example.fieldId,
                    operator,
                    values: [unitOfTimeExamples[unit].value],
                    settings: {
                        completed,
                        unitOfTime: unit,
                    },
                    prompt: `Find orders where ${example.phrase} is ${relativeOperatorPhrase(
                        operator,
                        completed,
                        unitOfTimeExamples[unit].value,
                        unit,
                    )}.`,
                })),
            ),
        ),
    ),
    ...(
        [
            FilterOperator.IN_THE_CURRENT,
            FilterOperator.NOT_IN_THE_CURRENT,
        ] as const
    ).flatMap((operator) =>
        aiDateUnits.flatMap((unit) =>
            relativeDatePrompts.map<CaseSeed>((example) => ({
                id: `${operator}_${unit}_${example.id}`,
                family: 'date',
                fieldId: example.fieldId,
                operator,
                values: [1],
                settings: {
                    completed: false,
                    unitOfTime: unit,
                },
                prompt: `Find orders where ${example.phrase} is ${currentOperatorPhrase(
                    operator,
                    unit,
                )}.`,
            })),
        ),
    ),
    ...(
        [
            FilterOperator.LESS_THAN,
            FilterOperator.LESS_THAN_OR_EQUAL,
            FilterOperator.GREATER_THAN,
            FilterOperator.GREATER_THAN_OR_EQUAL,
        ] as const
    ).flatMap((operator) =>
        dateComparisonExamples.map<CaseSeed>((example) => ({
            id: `${operator}_${example.id}`,
            family: 'date',
            fieldId: example.fieldId,
            operator,
            values: example.values,
            prompt: `Find orders where ${example.phrase} ${dateOperatorPhrases[operator]}.`,
        })),
    ),
    ...dateRangeExamples.map<CaseSeed>((example) => ({
        id: `inBetween_${example.id}`,
        family: 'date',
        fieldId: example.fieldId,
        operator: FilterOperator.IN_BETWEEN,
        values: example.values,
        prompt: `Find orders where ${example.phrase}.`,
    })),
];

export const filterPermutationCases: LlmPermutationCase[] = [
    ...booleanSeeds,
    ...stringSeeds,
    ...numberSeeds,
    ...dateSeeds,
].map(caseFromSeed);

export const filterPermutationGroups = Object.values(
    filterPermutationCases.reduce<
        Record<
            string,
            {
                family: FilterFamily;
                operator: FilterOperator;
                permutation: string;
                cases: LlmPermutationCase[];
            }
        >
    >((acc, testCase) => {
        const key = `${testCase.family}.${testCase.expected.operator}`;
        return {
            ...acc,
            [key]: {
                family: testCase.family,
                operator: testCase.expected.operator,
                permutation: testCase.permutation,
                cases: [...(acc[key]?.cases ?? []), testCase],
            },
        };
    }, {}),
);
