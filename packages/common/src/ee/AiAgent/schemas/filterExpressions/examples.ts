import { DimensionType } from '../../../../types/field';
import { FilterOperator, FilterType } from '../../../../types/filter';
import {
    getFilterExamples,
    type AiFilterExample,
} from '../filters/filterExamples';
import { filterExpressionOperatorDefinitions } from './operators';

export type FilterExpressionExample = AiFilterExample & {
    expression: string;
};

const exampleFieldByFilterType = {
    [FilterType.BOOLEAN]: {
        fieldId: 'orders_is_completed',
        fieldType: DimensionType.BOOLEAN,
    },
    [FilterType.STRING]: {
        fieldId: 'orders_status',
        fieldType: DimensionType.STRING,
    },
    [FilterType.NUMBER]: {
        fieldId: 'orders_amount',
        fieldType: DimensionType.NUMBER,
    },
    [FilterType.DATE]: {
        fieldId: 'orders_order_date',
        fieldType: DimensionType.DATE,
    },
} satisfies Record<FilterType, { fieldId: string; fieldType: DimensionType }>;

const additionalExampleValueByFilterType = {
    [FilterType.STRING]: 'another',
    [FilterType.NUMBER]: 500,
    [FilterType.DATE]: '2024-02-01',
} satisfies Record<Exclude<FilterType, FilterType.BOOLEAN>, string | number>;

const bareScalarPattern = /^[^\s,{}=()\\'"]+$/;
const reservedScalars = ['and', 'or', 'null'];

const formatFieldId = (fieldId: string): string =>
    /^[A-Za-z0-9_.-]+$/.test(fieldId) &&
    !['and', 'or'].includes(fieldId.toLowerCase())
        ? fieldId
        : `\`${fieldId.replaceAll('\\', '\\\\').replaceAll('`', '\\`')}\``;

const formatStringScalar = (value: string): string =>
    bareScalarPattern.test(value) &&
    !reservedScalars.includes(value.toLowerCase())
        ? value
        : JSON.stringify(value);

const formatScalar = (value: unknown): string => {
    switch (typeof value) {
        case 'boolean':
        case 'number':
            return String(value);
        case 'string':
            return formatStringScalar(value);
        default:
            throw new Error(
                `Unsupported filter expression example value: ${JSON.stringify(value)}`,
            );
    }
};

const requireSettings = (
    example: AiFilterExample,
): NonNullable<AiFilterExample['settings']> => {
    if (!example.settings) {
        throw new Error(
            `Missing settings for filter expression example ${example.operator}`,
        );
    }
    return example.settings;
};

const requireSingleValue = (example: AiFilterExample): unknown => {
    if (example.values?.length !== 1) {
        throw new Error(
            `Expected one value for filter expression example ${example.operator}`,
        );
    }
    return example.values[0];
};

export const formatFilterExpressionExample = (
    example: AiFilterExample,
): string => {
    const fieldId = formatFieldId(example.fieldId);

    switch (example.operator) {
        case FilterOperator.NULL:
        case FilterOperator.NOT_NULL:
            return `${fieldId} ${example.operator}`;
        case FilterOperator.IN_THE_PAST:
        case FilterOperator.NOT_IN_THE_PAST:
        case FilterOperator.IN_THE_NEXT: {
            const settings = requireSettings(example);
            return `${fieldId} ${example.operator}=${formatScalar(
                requireSingleValue(example),
            )}{unit:${settings.unitOfTime},completed:${settings.completed}}`;
        }
        case FilterOperator.IN_THE_CURRENT:
        case FilterOperator.NOT_IN_THE_CURRENT: {
            const settings = requireSettings(example);
            return `${fieldId} ${example.operator}=${settings.unitOfTime}`;
        }
        default: {
            if (!example.values || example.values.length === 0) {
                throw new Error(
                    `Missing values for filter expression example ${example.operator}`,
                );
            }
            return `${fieldId} ${example.operator}=${example.values
                .map(formatScalar)
                .join(',')}`;
        }
    }
};

export const FILTER_EXPRESSION_PUNCTUATED_STRING_EXAMPLE =
    formatFilterExpressionExample({
        fieldId: 'orders_product_name',
        fieldType: DimensionType.STRING,
        fieldFilterType: FilterType.STRING,
        operator: FilterOperator.EQUALS,
        values: ['Coffee Filters (100pk)'],
    });

const expandFiniteExamplePermutations = (
    example: AiFilterExample,
    argumentCount: (typeof filterExpressionOperatorDefinitions)[number]['argumentCountByFilterType'][FilterType],
): AiFilterExample[] => {
    if (
        example.fieldFilterType === FilterType.BOOLEAN &&
        (example.operator === FilterOperator.EQUALS ||
            example.operator === FilterOperator.NOT_EQUALS)
    ) {
        return [true, false].map((value) => ({
            ...example,
            values: [value],
        }));
    }

    if (
        argumentCount === 'oneOrMore' &&
        example.values?.length === 1 &&
        example.fieldFilterType !== FilterType.BOOLEAN
    ) {
        return [
            example,
            {
                ...example,
                values: [
                    ...example.values,
                    additionalExampleValueByFilterType[example.fieldFilterType],
                ],
            },
        ];
    }

    return [example];
};

export const getFilterExpressionExamples = (): FilterExpressionExample[] =>
    Object.values(FilterType).flatMap((fieldFilterType) => {
        const field = exampleFieldByFilterType[fieldFilterType];

        return filterExpressionOperatorDefinitions.flatMap((definition) => {
            const argumentCount =
                definition.argumentCountByFilterType[fieldFilterType];
            if (argumentCount === null) {
                return [];
            }

            const canonicalExamples = getFilterExamples({
                ...field,
                fieldFilterType,
                operators: [definition.operator],
            });
            if (canonicalExamples.length === 0) {
                throw new Error(
                    `Missing ${fieldFilterType} filter expression example for ${definition.operator}`,
                );
            }

            return canonicalExamples
                .flatMap((example) =>
                    expandFiniteExamplePermutations(example, argumentCount),
                )
                .map((example) => ({
                    ...example,
                    expression: formatFilterExpressionExample(example),
                }));
        });
    });
