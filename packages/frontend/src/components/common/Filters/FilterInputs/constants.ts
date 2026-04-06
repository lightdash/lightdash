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
    [FilterOperator.YEAR_TO_DATE]: 'is year to date (YTD)',
    [FilterOperator.QUARTER_TO_DATE]: 'is quarter to date (QTD)',
    [FilterOperator.MONTH_TO_DATE]: 'is month to date (MTD)',
    [FilterOperator.WEEK_TO_DATE]: 'is week to date (WTD)',
};

export const filterOperatorDescription: Partial<
    Record<FilterOperator, string>
> = {
    [FilterOperator.YEAR_TO_DATE]:
        "Includes rows where the day-of-year is on or before today's day-of-year. For example, if today is March 31 (day 90), this includes days 1-90 of every year in your data.",
    [FilterOperator.QUARTER_TO_DATE]:
        "Includes rows where the day within the quarter is on or before today's position in the current quarter. Useful for comparing equivalent portions of quarters.",
    [FilterOperator.MONTH_TO_DATE]:
        "Includes rows where the day of the month is on or before today's day of the month. For example, if today is the 15th, this includes days 1-15 of every month.",
    [FilterOperator.WEEK_TO_DATE]:
        "Includes rows where the day of the week is on or before today's day of the week. Useful for comparing equivalent portions of weeks.",
};
