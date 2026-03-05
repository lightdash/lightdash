import type { ItemsMap } from './field';
import type { BaseFilterRule, FieldTarget, FilterOperator } from './filter';

export type ConditionalFormattingMinMax<T = number> = {
    /** Minimum value (number or 'auto') */
    min: T;
    /** Maximum value (number or 'auto') */
    max: T;
};

export type ConditionalFormattingColorRange = {
    /** Start color for gradient */
    start: string;
    /** End color for gradient */
    end: string;
};

export type ConditionalFormattingWithValues<T = number | string> =
    BaseFilterRule<FilterOperator, T> & {
        /** Values to compare against */
        values: T[];
    };

export type ConditionalFormattingWithCompareTarget<T = number | string> =
    BaseFilterRule<FilterOperator, T> & {
        /** Target field to compare against */
        compareTarget: FieldTarget | null;
        /** Values to compare against */
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
    /** Target field for the formatting rule */
    target: FieldTarget | null;
    /** Color for single-color conditional formatting */
    color: string;
    /** Color for dark mode */
    darkColor?: string;
    /** Rules for single-color conditional formatting */
    rules: ConditionalFormattingWithFilterOperator[];
    /** Apply formatting to cell background or text */
    applyTo?: ConditionalFormattingColorApplyTo;
};

export const isConditionalFormattingConfigWithSingleColor = (
    rule: ConditionalFormattingConfig,
): rule is ConditionalFormattingConfigWithSingleColor =>
    'color' in rule && typeof rule.color === 'string' && 'rules' in rule;

export type ConditionalFormattingConfigWithColorRange = {
    /** Target field for the formatting rule */
    target: FieldTarget | null;
    /** Color range for gradient conditional formatting */
    color: ConditionalFormattingColorRange;
    /** Rule for color range formatting (min/max values) */
    rule: ConditionalFormattingMinMax<number | 'auto'>;
    /** Apply formatting to cell background or text */
    applyTo?: ConditionalFormattingColorApplyTo;
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

export enum ConditionalFormattingColorApplyTo {
    CELL = 'cell',
    TEXT = 'text',
}

export type ConditionalRuleLabel = {
    field: string;
    operator: string;
    value?: string;
};
