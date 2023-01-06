import { v4 as uuidv4 } from 'uuid';
import assertUnreachable from '../utils/assertUnreachable';
import { ConditionalRule } from './conditionalRule';
import { FieldTarget, FilterOperator } from './filter';

export type ConditionalFormattingRule = ConditionalRule<FilterOperator, number>;

export interface ConditionalFormattingConfig {
    target: FieldTarget | null;
    rules: ConditionalFormattingRule[];
    color: string;
}

export const createConditionalFormatingRule =
    (): ConditionalFormattingRule => ({
        operator: FilterOperator.EQUALS,
        values: [],
    });

export const hasMatchingConditionalRules = (
    value: number,
    rules: ConditionalFormattingConfig['rules'],
) =>
    rules.every((rule) => {
        if (!rule.values || rule.values.length === 0) {
            return false;
        }

        return rule.values.some((conditionValue) => {
            switch (rule.operator) {
                case FilterOperator.NULL:
                    return value === null;
                case FilterOperator.NOT_NULL:
                    return value !== conditionValue;
                case FilterOperator.EQUALS:
                    return value === conditionValue;
                case FilterOperator.NOT_EQUALS:
                    return value !== conditionValue;
                case FilterOperator.LESS_THAN:
                    return value < conditionValue;
                case FilterOperator.GREATER_THAN:
                    return value > conditionValue;
                case FilterOperator.STARTS_WITH:
                case FilterOperator.INCLUDE:
                case FilterOperator.NOT_INCLUDE:
                case FilterOperator.LESS_THAN_OR_EQUAL:
                case FilterOperator.GREATER_THAN_OR_EQUAL:
                case FilterOperator.IN_THE_PAST:
                case FilterOperator.IN_THE_CURRENT:
                    throw new Error('Not implemented');
                default:
                    return assertUnreachable(
                        rule.operator,
                        'Unknown operator for conditional formatting',
                    );
            }
        });
    });
