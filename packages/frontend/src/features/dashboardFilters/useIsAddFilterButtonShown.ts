import {
    selectHaveFiltersChanged,
    selectIsAddFilterDisabled,
    useDashboardSelector,
    useHasDashboardTemporaryFilters,
} from '../dashboard/store';

// Whether the button draws anything: a viewer's goes when adding is disabled, unless the reset shows
export const useIsAddFilterButtonShown = (isEditMode: boolean) => {
    const isAddFilterDisabled = useDashboardSelector(selectIsAddFilterDisabled);
    const hasTemporaryFilters = useHasDashboardTemporaryFilters();
    const haveFiltersChanged =
        useDashboardSelector(selectHaveFiltersChanged) || hasTemporaryFilters;
    return isEditMode || !isAddFilterDisabled || haveFiltersChanged;
};
