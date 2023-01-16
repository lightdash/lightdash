import {
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
} from '../types/conditionalFormatting';
import { ConditionalOperator } from '../types/conditionalRule';
import { Field, isField } from '../types/field';
import { TableCalculation } from '../types/metricQuery';
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

export const getConditionalFormattingConfig = (
    conditionalFormattings: ConditionalFormattingConfig[] | undefined,
    field: Field | TableCalculation | undefined,
) => {
    if (
        !conditionalFormattings ||
        !field ||
        !isField(field) ||
        !isNumericItem(field)
    ) {
        return undefined;
    }

    return (
        conditionalFormattings.find(
            (c) => c.target?.fieldId === getItemId(field),
        ) || conditionalFormattings.find((config) => !config.target)
    );
};

export const hasMatchingConditionalRules = (
    value: number | string | undefined,
    config: ConditionalFormattingConfig | undefined,
) => {
    if (!config) return undefined;

    const parsedValue = typeof value === 'string' ? Number(value) : value;

    console.log({ parsedValue });

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
