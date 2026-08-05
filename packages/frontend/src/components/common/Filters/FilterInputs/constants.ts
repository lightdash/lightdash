import { FilterOperator } from '@lightdash/common';

export const filterOperatorLabel: Record<FilterOperator, string> = {
    [FilterOperator.NULL]: 'is null',
    [FilterOperator.NOT_NULL]: 'is not null',
    [FilterOperator.EQUALS]: 'is',
    [FilterOperator.NOT_EQUALS]: 'is not',
    [FilterOperator.STARTS_WITH]: 'starts with',
    [FilterOperator.ENDS_WITH]: 'ends with',
    [FilterOperator.NOT_INCLUDE]: 'does not include',
    [FilterOperator.INCLUDE]: 'includes',
    [FilterOperator.LESS_THAN]: 'is less than',
    [FilterOperator.LESS_THAN_OR_EQUAL]: 'is less than or equal',
    [FilterOperator.GREATER_THAN]: 'is greater than',
    [FilterOperator.GREATER_THAN_OR_EQUAL]: 'is greater than or equal',
    [FilterOperator.IN_THE_PAST]: 'in the last',
    [FilterOperator.NOT_IN_THE_PAST]: 'not in the last',
    [FilterOperator.IN_THE_NEXT]: 'in the next',
    [FilterOperator.IN_THE_CURRENT]: 'in the current',
    [FilterOperator.NOT_IN_THE_CURRENT]: 'not in the current',
    [FilterOperator.IN_BETWEEN]: 'is between',
    [FilterOperator.NOT_IN_BETWEEN]: 'is not between',
    [FilterOperator.IN_PERIOD_TO_DATE]: 'in all',
};

export const filterOperatorDropdownLabel: Partial<
    Record<FilterOperator, string>
> = {
    [FilterOperator.IN_PERIOD_TO_DATE]: 'in all periods to date',
};

export const filterOperatorDescription: Partial<
    Record<FilterOperator, string>
> = {
    [FilterOperator.IN_PERIOD_TO_DATE]:
        'Trims every period in the range to the same point as today — e.g. with weeks selected, if today is Thursday, you get Mon–Thu of every week. Useful for like-for-like comparisons (WTD, MTD, QTD, YTD). For just the current period so far, use "in the current" instead.',
};
