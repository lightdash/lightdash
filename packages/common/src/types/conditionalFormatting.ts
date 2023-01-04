import { CompiledField } from './field';
import { FilterRule } from './filter';

export interface ConditionalFormattingConfig {
    field: CompiledField;
    filter: FilterRule;
    color: string;
}
