import {
    assertUnreachable,
    TableCalculationTemplateType,
} from '@lightdash/common';

export const TemplateTypeLabels: Record<TableCalculationTemplateType, string> =
    {
        [TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS]:
            'Percent change from previous',
        [TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE]:
            'Percent of previous value',
        [TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL]:
            'Percent of column total',
        [TableCalculationTemplateType.RANK_IN_COLUMN]: 'Rank in column',
        [TableCalculationTemplateType.RUNNING_TOTAL]: 'Running total',
        [TableCalculationTemplateType.WINDOW_FUNCTION]: 'Window function',
    };

export const formatTemplateType = (
    type: TableCalculationTemplateType,
): string => {
    return TemplateTypeLabels[type] || type;
};

export const getTemplateDescription = (
    type: TableCalculationTemplateType,
): string => {
    switch (type) {
        case TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS:
            return 'Calculates the percentage change from the previous row value.';
        case TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE:
            return 'Shows the current value as a percentage of the previous row value.';
        case TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL:
            return 'Shows each value as a percentage of the column total.';
        case TableCalculationTemplateType.RANK_IN_COLUMN:
            return 'Ranks values within the column from highest to lowest.';
        case TableCalculationTemplateType.RUNNING_TOTAL:
            return 'Calculates a cumulative sum across rows.';
        case TableCalculationTemplateType.WINDOW_FUNCTION:
            return 'Applies SQL window functions (e.g., ROW_NUMBER, PERCENT_RANK) to the result set.';
        default:
            return assertUnreachable(type, `Unknown template type`);
    }
};
