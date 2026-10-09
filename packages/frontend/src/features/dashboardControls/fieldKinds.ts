import {
    FilterType,
    getFilterTypeFromItem,
    type DashboardFilterableField,
} from '@lightdash/common';

// Operators and inputs of a filter: its field's, else its SQL column's
export const getFilterRuleType = (
    field: DashboardFilterableField | null,
    sqlColumnFilterType: FilterType | null,
): FilterType =>
    field !== null
        ? getFilterTypeFromItem(field)
        : (sqlColumnFilterType ?? FilterType.STRING);
