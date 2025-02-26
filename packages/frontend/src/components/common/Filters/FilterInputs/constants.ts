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
};
