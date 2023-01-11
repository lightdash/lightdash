import {
    ConditionalFormattingConfig,
    ConditionalFormattingRule,
} from '../types/conditionalFormatting';
import { ConditionalOperator } from '../types/conditionalRule';
import { Field, isField } from '../types/field';
import { TableCalculation } from '../types/metricQuery';
import assertUnreachable from './assertUnreachable';
import { getItemId } from './item';

export const createConditionalFormatingRule =
    (): ConditionalFormattingRule => ({
        operator: ConditionalOperator.EQUALS,
        values: [],
    });

export const getConditionalFormattingConfig = (
    conditionalFormattings: ConditionalFormattingConfig[] | undefined,
    field: Field | TableCalculation | undefined,
) => {
    if (
        !conditionalFormattings ||
        !field ||
        !isField(field) ||
        field.type !== 'number'
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
    value: number | undefined,
    config: ConditionalFormattingConfig | undefined,
) => {
    if (!config) return undefined;

    return config.rules.every((rule) => {
        switch (rule.operator) {
            case ConditionalOperator.NULL:
                return value === null;
            case ConditionalOperator.NOT_NULL:
                return value !== null;
            case ConditionalOperator.EQUALS:
                return rule.values.some((v) => value === v);
            case ConditionalOperator.NOT_EQUALS:
                return rule.values.some((v) => value !== v);
            case ConditionalOperator.LESS_THAN:
                return value ? rule.values.some((v) => value < v) : false;
            case ConditionalOperator.GREATER_THAN:
                return value ? rule.values.some((v) => value > v) : false;
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
