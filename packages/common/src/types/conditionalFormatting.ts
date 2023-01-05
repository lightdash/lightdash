import { v4 as uuidv4 } from 'uuid';
import { getFilterRuleWithDefaultValue } from '../utils/filters';
import { CompiledField, fieldId } from './field';
import { FieldTarget, FilterOperator, FilterRule } from './filter';

export type ConditionalFormattingRule = FilterRule<
    FilterOperator,
    FieldTarget,
    never,
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
