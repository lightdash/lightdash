import { FilterOperator } from '@lightdash/common';

export { filterOperatorLabel } from '@lightdash/common';

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
