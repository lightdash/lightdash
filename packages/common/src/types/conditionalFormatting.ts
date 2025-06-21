import type { ItemsMap } from './field';
import type { BaseFilterRule, FieldTarget, FilterOperator } from './filter';

export type ConditionalFormattingMinMax<T = number> = {
    min: T;
    max: T;
};

export type ConditionalFormattingColorRange = {
    start: string;
    end: string;
};

export type ConditionalFormattingWithValues<T = number | string> =
    BaseFilterRule<FilterOperator, T> & {
        values: T[];
    };

export type ConditionalFormattingWithCompareTarget<T = number | string> =
    BaseFilterRule<FilterOperator, T> & {
        compareTarget: FieldTarget | null;
        values?: T[];
    };

export type ConditionalFormattingWithFilterOperator<T = number | string> =
    | ConditionalFormattingWithValues<T>
    | ConditionalFormattingWithCompareTarget<T>;

export const isConditionalFormattingWithValues = (
    rule: ConditionalFormattingWithFilterOperator,
): rule is ConditionalFormattingWithValues => 'values' in rule;

export const isConditionalFormattingWithCompareTarget = (
    rule: ConditionalFormattingWithFilterOperator,
): rule is ConditionalFormattingWithCompareTarget => 'compareTarget' in rule;

export type ConditionalFormattingConfigWithSingleColor = {
    target: FieldTarget | null;
    color: string;
    rules: ConditionalFormattingWithFilterOperator[];
};

export const isConditionalFormattingConfigWithSingleColor = (
    rule: ConditionalFormattingConfig,
): rule is ConditionalFormattingConfigWithSingleColor =>
    'color' in rule && typeof rule.color === 'string' && 'rules' in rule;

export type ConditionalFormattingConfigWithColorRange = {
    target: FieldTarget | null;
    color: ConditionalFormattingColorRange;
    rule: ConditionalFormattingMinMax<number | 'auto'>;
};

export const isConditionalFormattingConfigWithColorRange = (
    config: ConditionalFormattingConfig,
): config is ConditionalFormattingConfigWithColorRange =>
    'color' in config && typeof config.color === 'object';

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

export type ConditionalFormattingMinMaxMap = Record<
    string,
    ConditionalFormattingMinMax
>;

export type ConditionalFormattingRowFields = Record<
    string,
    {
        field: ItemsMap[string];
        value: unknown;
    }
>;

export enum ConditionalFormattingComparisonType {
    VALUES = 'values',
    TARGET_FIELD = 'target_field',
    TARGET_TO_VALUES = 'target_to_values',
}

export type ConditionalRuleLabel = {
    field: string;
    operator: string;
    value?: string;
};
