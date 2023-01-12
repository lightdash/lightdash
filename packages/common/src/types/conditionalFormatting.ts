import { ConditionalOperator, ConditionalRule } from './conditionalRule';
import { FieldTarget } from './filter';

export interface ConditionalFormattingRule<T = number>
    extends ConditionalRule<ConditionalOperator, T> {
    values: T[];
}

export interface ConditionalFormattingConfig {
    target: FieldTarget | null;
    rules: ConditionalFormattingRule[];
    color: string;
}
