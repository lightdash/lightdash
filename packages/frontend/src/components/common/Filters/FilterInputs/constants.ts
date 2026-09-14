import { FilterOperator, type UiStringKey } from '@lightdash/common';

export { filterOperatorLabel } from '@lightdash/common';

export const filterOperatorDropdownLabelKey: Partial<
    Record<FilterOperator, UiStringKey>
> = {
    [FilterOperator.IN_PERIOD_TO_DATE]:
        'filters.operators.inPeriodToDateDropdown',
};

export const filterOperatorDescriptionKey: Partial<
    Record<FilterOperator, UiStringKey>
> = {
    [FilterOperator.IN_PERIOD_TO_DATE]:
        'filters.operators.inPeriodToDateDescription',
};
