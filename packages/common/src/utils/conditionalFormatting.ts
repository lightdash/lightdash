import { findLast } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type {
    ConditionalFormattingRowFields,
    ConditionalFormattingWithCompareTarget,
    ItemsMap,
} from '..';
import {
    isConditionalFormattingConfigWithColorRange,
    isConditionalFormattingConfigWithSingleColor,
    isConditionalFormattingWithCompareTarget,
    isConditionalFormattingWithValues,
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
import { getItemId, isNumericItem, isStringDimension } from './item';

export const createConditionalFormattingRuleWithValues =
    (): ConditionalFormattingWithConditionalOperator => ({
        id: uuidv4(),
        operator: ConditionalOperator.EQUALS,
        values: [],
    });

export const createConditionalFormattingRuleWithCompareTarget =
    (): ConditionalFormattingWithCompareTarget => ({
        id: uuidv4(),
        operator: ConditionalOperator.EQUALS,
        compareTarget: null,
    });

export const createConditionalFormattingRuleWithCompareTargetValues =
    (): ConditionalFormattingWithCompareTarget => ({
        id: uuidv4(),
        operator: ConditionalOperator.EQUALS,
        compareTarget: null,
        values: [],
    });

export const createConditionalFormattingConfigWithSingleColor = (
    defaultColor: string,
    target: FieldTarget | null = null,
): ConditionalFormattingConfigWithSingleColor => ({
    target,
    color: defaultColor,
    rules: [createConditionalFormattingRuleWithValues()],
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
    rowFields?: ConditionalFormattingRowFields,
) => {
    if (!config) return false;

    const parsedValue = isNumericItem(field) ? Number(value) : value;
    const convertedValue = convertFormattedValue(parsedValue, field);

    const currentFieldId = getItemId(field);
    const targetFieldId = config.target?.fieldId;
    if (targetFieldId !== undefined && targetFieldId !== currentFieldId) {
        return false;
    }

    if (isConditionalFormattingConfigWithSingleColor(config)) {
        return config.rules.every((rule) => {
            let convertedCompareValue: number | unknown | undefined;
            let compareField: ItemsMap[string] | undefined;

            if (
                isConditionalFormattingWithCompareTarget(rule) &&
                rule.compareTarget?.fieldId &&
                rowFields
            ) {
                const rowField = rowFields[rule.compareTarget.fieldId];

                if (!rowField) return false;

                compareField = rowField.field;

                const parsedCompareValue = isNumericItem(compareField)
                    ? Number(rowField.value)
                    : rowField.value;
                convertedCompareValue = convertFormattedValue(
                    parsedCompareValue,
                    compareField,
                );
            }

            // Compares field value to values when there is no compare target
            const shouldCompareFieldToValue =
                isConditionalFormattingWithValues(rule) &&
                !isConditionalFormattingWithCompareTarget(rule);

            // Compares field value to compare target when there is a compare target and there are no values
            const shouldCompareFieldToTarget =
                isConditionalFormattingWithCompareTarget(rule) &&
                !isConditionalFormattingWithValues(rule);

            // Compares compare target value to values when there is a compare target and there are values
            const shouldCompareTargetToValue =
                isConditionalFormattingWithCompareTarget(rule) &&
                isConditionalFormattingWithValues(rule);

            switch (rule.operator) {
                case ConditionalOperator.NULL:
                    return convertedValue === null;
                case ConditionalOperator.NOT_NULL:
                    return convertedValue !== null;
                case ConditionalOperator.EQUALS:
                    if (shouldCompareFieldToValue) {
                        return rule.values.some((v) => convertedValue === v);
                    }

                    if (shouldCompareFieldToTarget) {
                        return convertedValue === convertedCompareValue;
                    }

                    if (shouldCompareTargetToValue) {
                        return rule.values.some(
                            (v) => convertedCompareValue === v,
                        );
                    }

                    throw new Error('Not implemented');
                case ConditionalOperator.NOT_EQUALS:
                    if (shouldCompareFieldToValue) {
                        return rule.values.some((v) => convertedValue !== v);
                    }

                    if (shouldCompareFieldToTarget) {
                        return convertedValue !== convertedCompareValue;
                    }

                    if (shouldCompareTargetToValue) {
                        return rule.values.some(
                            (v) => convertedCompareValue !== v,
                        );
                    }

                    throw new Error('Not implemented');
                case ConditionalOperator.LESS_THAN:
                    if (shouldCompareFieldToValue) {
                        return rule.values.some(
                            (v) =>
                                isNumericItem(field) &&
                                typeof v === 'number' &&
                                typeof convertedValue === 'number' &&
                                convertedValue < v,
                        );
                    }

                    if (shouldCompareFieldToTarget) {
                        return (
                            isNumericItem(field) &&
                            isNumericItem(compareField) &&
                            typeof convertedCompareValue === 'number' &&
                            typeof convertedValue === 'number' &&
                            convertedValue < convertedCompareValue
                        );
                    }

                    if (shouldCompareTargetToValue) {
                        return rule.values.some(
                            (v) =>
                                isNumericItem(compareField) &&
                                typeof v === 'number' &&
                                typeof convertedCompareValue === 'number' &&
                                convertedCompareValue < v,
                        );
                    }

                    throw new Error('Not implemented');
                case ConditionalOperator.GREATER_THAN:
                    if (shouldCompareFieldToValue) {
                        return rule.values.some(
                            (v) =>
                                isNumericItem(field) &&
                                typeof v === 'number' &&
                                typeof convertedValue === 'number' &&
                                convertedValue > v,
                        );
                    }

                    if (shouldCompareFieldToTarget) {
                        return (
                            isNumericItem(field) &&
                            isNumericItem(compareField) &&
                            typeof convertedCompareValue === 'number' &&
                            typeof convertedValue === 'number' &&
                            convertedValue > convertedCompareValue
                        );
                    }

                    if (shouldCompareTargetToValue) {
                        return rule.values.some(
                            (v) =>
                                isNumericItem(compareField) &&
                                typeof v === 'number' &&
                                typeof convertedCompareValue === 'number' &&
                                convertedCompareValue > v,
                        );
                    }

                    throw new Error('Not implemented');
                case ConditionalOperator.STARTS_WITH:
                case ConditionalOperator.ENDS_WITH:
                case ConditionalOperator.INCLUDE:
                    if (shouldCompareFieldToValue) {
                        return rule.values.some(
                            (v) =>
                                isStringDimension(field) &&
                                typeof v === 'string' &&
                                typeof convertedValue === 'string' &&
                                convertedValue.includes(v),
                        );
                    }

                    if (shouldCompareFieldToTarget) {
                        return (
                            isStringDimension(field) &&
                            isStringDimension(compareField) &&
                            typeof convertedValue === 'string' &&
                            typeof convertedCompareValue === 'string' &&
                            convertedValue.includes(convertedCompareValue)
                        );
                    }

                    if (shouldCompareTargetToValue) {
                        return rule.values.some(
                            (v) =>
                                isStringDimension(compareField) &&
                                typeof v === 'string' &&
                                typeof convertedCompareValue === 'string' &&
                                convertedCompareValue.includes(v),
                        );
                    }

                    throw new Error('Not implemented');
                case ConditionalOperator.IN_BETWEEN:
                case ConditionalOperator.NOT_IN_BETWEEN:
                case ConditionalOperator.NOT_INCLUDE:
                case ConditionalOperator.LESS_THAN_OR_EQUAL:
                case ConditionalOperator.GREATER_THAN_OR_EQUAL:
                case ConditionalOperator.IN_THE_PAST:
                case ConditionalOperator.NOT_IN_THE_PAST:
                case ConditionalOperator.IN_THE_NEXT:
                case ConditionalOperator.IN_THE_CURRENT:
                case ConditionalOperator.NOT_IN_THE_CURRENT:
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
    rowFields,
}: {
    field: ItemsMap[string] | undefined;
    value: unknown | undefined;
    minMaxMap: ConditionalFormattingMinMaxMap | undefined;
    conditionalFormattings: ConditionalFormattingConfig[] | undefined;
    rowFields?: ConditionalFormattingRowFields;
}) => {
    // For backwards compatibility with old table calculations without type
    const isCalculationTypeUndefined =
        field && isTableCalculation(field) && field.type === undefined;
    if (
        !conditionalFormattings ||
        !field ||
        (!isNumericItem(field) &&
            !isStringDimension(field) &&
            !isCalculationTypeUndefined)
    )
        return undefined;

    return findLast(conditionalFormattings, (config) =>
        hasMatchingConditionalRules(field, value, minMaxMap, config, rowFields),
    );
};

export const getConditionalFormattingDescription = (
    field: ItemsMap[string] | undefined,
    conditionalFormattingConfig: ConditionalFormattingConfig | undefined,
    rowFields: ConditionalFormattingRowFields,
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
            .map<
                ConditionalRuleLabels & { isComparingTargetToValues?: boolean }
            >((r) => {
                const fieldLabel = getConditionalRuleLabel(r, field);
                if (isConditionalFormattingWithCompareTarget(r)) {
                    const compareRowField = r.compareTarget?.fieldId
                        ? rowFields[r.compareTarget?.fieldId]
                        : undefined;

                    if (
                        !compareRowField ||
                        !isFilterableItem(compareRowField.field)
                    ) {
                        return fieldLabel;
                    }

                    // If there are no values, then the field is being compared to the compare target
                    if (!isConditionalFormattingWithValues(r)) {
                        return {
                            ...fieldLabel,
                            value: String(compareRowField.value),
                        };
                    }

                    // If there are values, then the target is being compared to the values
                    return {
                        ...getConditionalRuleLabel(r, compareRowField.field),
                        isComparingTargetToValues: true,
                    };
                }

                return fieldLabel;
            })
            .map((l) =>
                l.isComparingTargetToValues
                    ? `${l.field} ${l.operator} ${l.value}`
                    : `${l.operator} ${l.value}`,
            )
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
