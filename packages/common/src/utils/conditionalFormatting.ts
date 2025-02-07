import { findLast } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { ItemsMap } from '..';
import {
    isConditionalFormattingConfigWithColorRange,
    isConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingColorRange,
    type ConditionalFormattingConfig,
    type ConditionalFormattingConfigWithColorRange,
    type ConditionalFormattingConfigWithSingleColor,
    type ConditionalFormattingMinMax,
    type ConditionalFormattingMinMaxMap,
    type ConditionalFormattingWithConditionalOperator,
} from '../types/conditionalFormatting';
import {
    ConditionalOperator,
    type ConditionalRuleLabels,
} from '../types/conditionalRule';
import {
    CustomFormatType,
    Format,
    isField,
    isFilterableItem,
    isTableCalculation,
    type FilterableItem,
} from '../types/field';
import { type FieldTarget } from '../types/filter';
import assertUnreachable from './assertUnreachable';
import { getItemId, isNumericItem } from './item';

export const createConditionalFormatingRule =
    (): ConditionalFormattingWithConditionalOperator => ({
        id: uuidv4(),
        operator: ConditionalOperator.EQUALS,
        values: [],
    });

export const createConditionalFormattingConfigWithSingleColor = (
    defaultColor: string,
    target: FieldTarget | null = null,
): ConditionalFormattingConfigWithSingleColor => ({
    target,
    color: defaultColor,
    rules: [createConditionalFormatingRule()],
});

export const createConditionalFormattingConfigWithColorRange = (
    defaultColor: string,
    target: FieldTarget | null = null,
): ConditionalFormattingConfigWithColorRange => ({
    target,
    color: {
        start: '#ffffff',
        end: defaultColor,
        steps: 5,
    },
    rule: {
        min: 0,
        max: 100,
    },
});

export const hasPercentageFormat = (field: ItemsMap[string] | undefined) => {
    if (!field) return false;

    return (
        (isField(field) && field?.format === Format.PERCENT) ||
        (isTableCalculation(field) &&
            field.format?.type === CustomFormatType.PERCENT)
    );
};

export const convertFormattedValue = <T extends unknown>(
    value: T,
    field: ItemsMap[string] | undefined,
): T | number => {
    if (!field) return value;

    if (hasPercentageFormat(field)) {
        return typeof value === 'number' ? value * 100 : value;
    }

    return value;
};

export const getMinMaxFromMinMaxMap = (
    minMaxMap: ConditionalFormattingMinMaxMap,
) => ({
    min: Math.min(...Object.values(minMaxMap).map((m) => m.min)),
    max: Math.max(...Object.values(minMaxMap).map((m) => m.max)),
});

export const hasMatchingConditionalRules = (
    field: ItemsMap[string],
    value: unknown,
    minMaxMap: ConditionalFormattingMinMaxMap,
    config: ConditionalFormattingConfig | undefined,
) => {
    if (!config) return false;

    const parsedValue = typeof value === 'string' ? Number(value) : value;
    const convertedValue = convertFormattedValue(parsedValue, field);

    const currentFieldId = getItemId(field);
    const targetFieldId = config.target?.fieldId;
    if (targetFieldId !== undefined && targetFieldId !== currentFieldId) {
        return false;
    }

    if (isConditionalFormattingConfigWithSingleColor(config)) {
        return config.rules.every((rule) => {
            switch (rule.operator) {
                case ConditionalOperator.NULL:
                    return convertedValue === null;
                case ConditionalOperator.NOT_NULL:
                    return convertedValue !== null;
                case ConditionalOperator.EQUALS:
                    return rule.values.some((v) => convertedValue === v);
                case ConditionalOperator.NOT_EQUALS:
                    return rule.values.some((v) => convertedValue !== v);
                case ConditionalOperator.LESS_THAN:
                    return typeof convertedValue === 'number'
                        ? rule.values.some((v) => convertedValue < v)
                        : false;
                case ConditionalOperator.GREATER_THAN:
                    return typeof convertedValue === 'number'
                        ? rule.values.some((v) => convertedValue > v)
                        : false;
                case ConditionalOperator.STARTS_WITH:
                case ConditionalOperator.ENDS_WITH:
                case ConditionalOperator.INCLUDE:
                case ConditionalOperator.NOT_INCLUDE:
                case ConditionalOperator.LESS_THAN_OR_EQUAL:
                case ConditionalOperator.GREATER_THAN_OR_EQUAL:
                case ConditionalOperator.IN_THE_PAST:
                case ConditionalOperator.NOT_IN_THE_PAST:
                case ConditionalOperator.IN_THE_NEXT:
                case ConditionalOperator.IN_THE_CURRENT:
                case ConditionalOperator.NOT_IN_THE_CURRENT:
                case ConditionalOperator.IN_BETWEEN:
                    throw new Error('Not implemented');
                default:
                    return assertUnreachable(
                        rule.operator,
                        'Unknown operator for conditional formatting',
                    );
            }
        });
    }

    if (isConditionalFormattingConfigWithColorRange(config)) {
        if (typeof convertedValue !== 'number') return false;

        let min: number;
        let max: number;

        if (config.rule.min === 'auto') {
            min =
                targetFieldId && targetFieldId in minMaxMap
                    ? minMaxMap[targetFieldId].min
                    : getMinMaxFromMinMaxMap(minMaxMap).min;
        } else {
            min = config.rule.min;
        }

        if (config.rule.max === 'auto') {
            max =
                targetFieldId && targetFieldId in minMaxMap
                    ? minMaxMap[targetFieldId].max
                    : getMinMaxFromMinMaxMap(minMaxMap).max;
        } else {
            max = config.rule.max;
        }

        return convertedValue >= min && convertedValue <= max;
    }

    return assertUnreachable(config, 'Unknown conditional formatting config');
};

export const getConditionalFormattingConfig = ({
    field,
    value,
    minMaxMap = {},
    conditionalFormattings,
}: {
    field: ItemsMap[string] | undefined;
    value: unknown | undefined;
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    conditionalFormattings: ConditionalFormattingConfig[] | undefined;
}) => {
    // For backwards compatibility with old table calculations without type
    const isCalculationTypeUndefined =
        field && isTableCalculation(field) && field.type === undefined;
    if (
        !conditionalFormattings ||
        !field ||
        (!isNumericItem(field) && !isCalculationTypeUndefined)
    )
        return undefined;

    return findLast(conditionalFormattings, (config) =>
        hasMatchingConditionalRules(field, value, minMaxMap, config),
    );
};

export const getConditionalFormattingDescription = (
    field: ItemsMap[string] | undefined,
    conditionalFormattingConfig: ConditionalFormattingConfig | undefined,
    getConditionalRuleLabel: (
        rule: ConditionalFormattingWithConditionalOperator,
        item: FilterableItem,
    ) => ConditionalRuleLabels,
): string | undefined => {
    if (!field || !isFilterableItem(field) || !conditionalFormattingConfig) {
        return undefined;
    }

    if (
        isConditionalFormattingConfigWithColorRange(conditionalFormattingConfig)
    ) {
        return [
            `is greater than or equal to ${
                conditionalFormattingConfig.rule.min === 'auto'
                    ? 'min value in table'
                    : conditionalFormattingConfig.rule.min
            }`,
            `is less than or equal to ${
                conditionalFormattingConfig.rule.max === 'auto'
                    ? 'max value in table'
                    : conditionalFormattingConfig.rule.max
            }`,
        ].join(' and ');
    }

    if (
        isConditionalFormattingConfigWithSingleColor(
            conditionalFormattingConfig,
        )
    ) {
        return conditionalFormattingConfig.rules
            .map((r) => getConditionalRuleLabel(r, field))
            .map((l) => `${l.operator} ${l.value}`)
            .join(' and ');
    }

    return assertUnreachable(
        conditionalFormattingConfig,
        'Unknown conditional formatting config',
    );
};

type GetColorFromRangeFunction = (
    value: number,
    colorRange: ConditionalFormattingColorRange,
    minMaxRange: ConditionalFormattingMinMax,
) => string | undefined;

export const getConditionalFormattingColorWithColorRange = ({
    field,
    value,
    config,
    minMaxMap = {},
    getColorFromRange,
}: {
    field: ItemsMap[string] | undefined;
    value: unknown;
    config: ConditionalFormattingConfigWithColorRange;
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    getColorFromRange: GetColorFromRangeFunction;
}) => {
    if (!field) return undefined;

    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    const convertedValue = convertFormattedValue(numericValue, field);

    const currentFieldId = getItemId(field);
    const targetFieldId = config.target?.fieldId;
    if (targetFieldId !== undefined && targetFieldId !== currentFieldId) {
        return undefined;
    }

    if (typeof convertedValue !== 'number') return undefined;

    let min: number;
    let max: number;

    if (config.rule.min === 'auto') {
        min =
            targetFieldId && targetFieldId in minMaxMap
                ? minMaxMap[targetFieldId].min
                : getMinMaxFromMinMaxMap(minMaxMap).min;
    } else {
        min = config.rule.min;
    }

    if (config.rule.max === 'auto') {
        max =
            targetFieldId && targetFieldId in minMaxMap
                ? minMaxMap[targetFieldId].max
                : getMinMaxFromMinMaxMap(minMaxMap).max;
    } else {
        max = config.rule.max;
    }

    return getColorFromRange(convertedValue, config.color, { min, max });
};

export const getConditionalFormattingColorWithSingleColor = ({
    config,
}: {
    config: ConditionalFormattingConfigWithSingleColor;
}) => config.color;

export const getConditionalFormattingColor = ({
    field,
    value,
    config,
    minMaxMap,
    getColorFromRange,
}: {
    field: ItemsMap[string] | undefined;
    value: unknown;
    config: ConditionalFormattingConfig | undefined;
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    getColorFromRange: GetColorFromRangeFunction;
}) => {
    if (!config) return undefined;

    if (isConditionalFormattingConfigWithSingleColor(config)) {
        return getConditionalFormattingColorWithSingleColor({ config });
    }

    return getConditionalFormattingColorWithColorRange({
        field,
        value,
        config,
        minMaxMap,
        getColorFromRange,
    });
};
