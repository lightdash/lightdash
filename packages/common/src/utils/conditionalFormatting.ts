import {
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
} from '../types/conditionalFormatting';
import { ConditionalOperator } from '../types/conditionalRule';
import { Field, TableCalculation } from '../types/field';
import assertUnreachable from './assertUnreachable';
import { getItemId, isNumericItem } from './item';

export const createConditionalFormatingRule =
    (): ConditionalFormattingRule => ({
        operator: ConditionalOperator.EQUALS,
        values: [],
    });

export const createConditionalFormattingConfig =
    (): ConditionalFormattingConfig => ({
        target: null,
        color: '',
        rules: [createConditionalFormatingRule()],
    });

export const hasMatchingConditionalRules = (
    value: number | string | undefined,
    config: ConditionalFormattingConfig | undefined,
) => {
    if (!config) return false;

    const parsedValue = typeof value === 'string' ? Number(value) : value;

    return config.rules.every((rule) => {
        switch (rule.operator) {
            case ConditionalOperator.NULL:
                return parsedValue === null;
            case ConditionalOperator.NOT_NULL:
                return parsedValue !== null;
            case ConditionalOperator.EQUALS:
                return rule.values.some((v) => parsedValue === v);
            case ConditionalOperator.NOT_EQUALS:
                return rule.values.some((v) => parsedValue !== v);
            case ConditionalOperator.LESS_THAN:
                return parsedValue !== undefined
                    ? rule.values.some((v) => parsedValue < v)
                    : false;
            case ConditionalOperator.GREATER_THAN:
                return parsedValue !== undefined
                    ? rule.values.some((v) => parsedValue > v)
                    : false;
            case ConditionalOperator.STARTS_WITH:
            case ConditionalOperator.INCLUDE:
            case ConditionalOperator.NOT_INCLUDE:
            case ConditionalOperator.LESS_THAN_OR_EQUAL:
            case ConditionalOperator.GREATER_THAN_OR_EQUAL:
            case ConditionalOperator.IN_THE_PAST:
            case ConditionalOperator.IN_THE_NEXT:
            case ConditionalOperator.IN_THE_CURRENT:
            case ConditionalOperator.IN_BETWEEN:
                throw new Error('Not implemented');
            default:
                return assertUnreachable(
                    rule.operator,
                    'Unknown operator for conditional formatting',
                );
        }
    });
};

export const getConditionalFormattingConfig = (
    field: Field | TableCalculation | undefined,
    value: number | string | undefined,
    conditionalFormattings: ConditionalFormattingConfig[] | undefined,
) => {
    if (!conditionalFormattings || !field || !isNumericItem(field))
        return undefined;

    const fieldConfigs = conditionalFormattings.filter(
        (c) => c.target?.fieldId === getItemId(field) || !c.target,
    );

    return fieldConfigs
        .reverse()
        .find((c) => hasMatchingConditionalRules(value, c));
};
