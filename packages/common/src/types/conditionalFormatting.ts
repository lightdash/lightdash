import {
    type ConditionalOperator,
    type ConditionalRule,
} from './conditionalRule';
import { type FieldTarget } from './filter';

export type ConditionalFormattingWithConditionalOperator<T = number> =
    ConditionalRule<ConditionalOperator, T> & {
        values: T[];
    };

export type ConditionalFormattingWithRange<T = number> = {
    min: T;
    max: T;
};

export type ConditionalFormattingConfigWithSingleColor = {
    target: FieldTarget | null;
    color: string;
    rules: ConditionalFormattingWithConditionalOperator[];
};

export const isConditionalFormattingConfigWithSingleColor = (
    rule: ConditionalFormattingConfig,
): rule is ConditionalFormattingConfigWithSingleColor =>
    'color' in rule && typeof rule.color === 'string' && 'rules' in rule;

export type ConditionalFormattingConfigWithColorRange = {
    target: FieldTarget | null;
    color: {
        start: string;
        end: string;
        steps: 5;
    };
    rule: ConditionalFormattingWithRange;
};

export const isConditionalFormattingConfigWithColorRange = (
    config: ConditionalFormattingConfig,
): config is ConditionalFormattingConfigWithColorRange =>
    'color' in config &&
    typeof config.color === 'object' &&
    'steps' in config.color;

export type ConditionalFormattingConfig =
    | ConditionalFormattingConfigWithSingleColor
    | ConditionalFormattingConfigWithColorRange;

export enum ConditionalFormattingConfigType {
    Single = 'single',
    Range = 'range',
}

export const getConditionalFormattingConfigType = (
    rule: ConditionalFormattingConfig,
): ConditionalFormattingConfigType => {
    if (isConditionalFormattingConfigWithSingleColor(rule)) {
        return ConditionalFormattingConfigType.Single;
    }

    if (isConditionalFormattingConfigWithColorRange(rule)) {
        return ConditionalFormattingConfigType.Range;
    }

    throw new Error('Invalid conditional formatting rule');
};
