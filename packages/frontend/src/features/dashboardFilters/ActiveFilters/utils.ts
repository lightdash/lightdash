import { FilterOperator, type DashboardFilterRule } from '@lightdash/common';
import { formatDisplayValue } from '../../../components/common/Filters/FilterInputs/utils';

const MAX_DISPLAYED_VALUES = 2;

export type TruncatedValuesDisplay = {
    displayedValues: string[];
    additionalValues: string[];
    hasMore: boolean;
};

const EMPTY_DISPLAY: TruncatedValuesDisplay = {
    displayedValues: [],
    additionalValues: [],
    hasMore: false,
};

// Date values carry units (e.g. "2 months"), booleans have localized labels,
// and null operators take no value, so all defer to the composed rule label.
export const getTruncatedValuesDisplay = (
    values: DashboardFilterRule['values'],
    showsComposedValue: boolean,
    operator: FilterOperator,
): TruncatedValuesDisplay => {
    if (
        showsComposedValue ||
        operator === FilterOperator.NULL ||
        operator === FilterOperator.NOT_NULL
    ) {
        return EMPTY_DISPLAY;
    }

    if (!values || values.length === 0) return EMPTY_DISPLAY;

    const formattedValues = values.map((v) => formatDisplayValue(String(v)));
    const additionalValues = formattedValues.slice(MAX_DISPLAYED_VALUES);

    return {
        displayedValues: formattedValues.slice(0, MAX_DISPLAYED_VALUES),
        additionalValues,
        hasMore: additionalValues.length > 0,
    };
};
