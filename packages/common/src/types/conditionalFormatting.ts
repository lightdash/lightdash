import { v4 as uuidv4 } from 'uuid';
import assertUnreachable from '../utils/assertUnreachable';
import { getFilterRuleWithDefaultValue } from '../utils/filters';
import { CompiledField, fieldId } from './field';
import { FieldTarget, FilterOperator, FilterRule } from './filter';

export type ConditionalFormattingRule = FilterRule<
    FilterOperator,
    FieldTarget,
    number,
    never
>;

export interface ConditionalFormattingConfig {
    field: CompiledField;
    rules: ConditionalFormattingRule[];
    color: string;
}

export const createConditionalFormatingRule = (
    field: CompiledField,
): ConditionalFormattingRule =>
    getFilterRuleWithDefaultValue(
        field,
        {
            id: uuidv4(),
            target: { fieldId: fieldId(field) },
            operator: FilterOperator.EQUALS,
        },
        [],
    );

export const hasConditionalFormatting = (
    rules: ConditionalFormattingConfig['rules'],
    value: number,
) =>
    rules.every((rule) =>
        rule.values && rule.values.length > 0
            ? rule.values.some((conditionValue) => {
                  const { operator } = rule;

                  switch (operator) {
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
                              operator,
                              'Unknown operator',
                          );
                  }
              })
            : false,
    );
