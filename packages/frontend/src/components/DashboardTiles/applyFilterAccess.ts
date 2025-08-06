import {
    type Account,
    type FilterDashboardToRule,
    FilterInteractivityValues,
    isJwtUser,
} from '@lightdash/common';

export const applyFilterAccess = (
    account: Account | undefined,
    filterRules: FilterDashboardToRule[],
) => {
    if (!isJwtUser(account)) return filterRules;

    const { filtering } = account.access;

    if (filtering?.enabled === FilterInteractivityValues.all) {
        return filterRules;
    }

    const allowedFilters =
        (filtering?.enabled && filtering?.allowedFilters) ?? [];

    return allowedFilters
        ? filterRules.filter((f) => allowedFilters?.includes(f.id))
        : [];
};
