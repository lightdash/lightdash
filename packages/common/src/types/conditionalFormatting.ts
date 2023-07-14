import { ConditionalOperator, ConditionalRule } from './conditionalRule';
import { FieldTarget } from './filter';

export type ConditionalFormattingWithConditionalOperator<T = number> =
    ConditionalRule<ConditionalOperator, T> & {
        values: T[];
    };

export const isConditionalFormattingRuleWithConditionalOperator = (
    rule: ConditionalFormattingConfig['rules'][0],
): rule is ConditionalFormattingWithConditionalOperator => 'values' in rule;

export type ConditionalFormattingWithRange<T = number> = {
    min: T;
    max: T;
};

export const isConditionalFormattingRuleWithRange = (
    rule: ConditionalFormattingConfig['rules'][0],
): rule is ConditionalFormattingWithRange => 'min' in rule && 'max' in rule;

export type ConditionalFormattingConfig = {
    target: FieldTarget | null;
    rules: (
        | ConditionalFormattingWithConditionalOperator
        | ConditionalFormattingWithRange
    )[];
    color: string | string[];
};
