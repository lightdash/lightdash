import { getDashboardFilterField } from '@lightdash/common';
import { type FC } from 'react';
import useDashboardContext from '../../../providers/Dashboard/useDashboardContext';
import Filter from './Filter';
import { UnresolvedFilter } from './UnresolvedFilter';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from './useFilterTabPlacement';

type Props = {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
    triggerClassName?: string;
    dropdownClassName?: string;
};

export const TemporaryFilters: FC<Props> = ({
    isEditMode,
    activeTabUuid,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
    triggerClassName,
    dropdownClassName,
}) => {
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const removeDimensionDashboardFilter = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const removeMetricDashboardFilter = useDashboardContext(
        (c) => c.removeMetricDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const { getTabsUsingFilter, getOrphanedState } = useFilterTabPlacement();

    return (
        <>
            {dashboardTemporaryFilters.metrics.map((item, index) => {
                const metricField = getDashboardFilterField(
                    allFilterableMetricsMap,
                    item,
                    filterableFieldsByTileUuid,
                );
                const appliesToTabs = getTabsUsingFilter(item);

                if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid)) {
                    return null;
                }

                return metricField ? (
                    <Filter
                        key={item.id}
                        isTemporary
                        isEditMode={isEditMode}
                        {...getOrphanedState(item, appliesToTabs)}
                        field={metricField}
                        filterRule={item}
                        triggerClassName={triggerClassName}
                        dropdownClassName={dropdownClassName}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            removeMetricDashboardFilter(index, true)
                        }
                        onUpdate={(value) =>
                            updateMetricDashboardFilter(
                                value,
                                index,
                                true,
                                isEditMode,
                            )
                        }
                    />
                ) : (
                    <UnresolvedFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeMetricDashboardFilter(index, true)
                        }
                    />
                );
            })}

            {dashboardTemporaryFilters.dimensions.map((item, index) => {
                const field = getDashboardFilterField(
                    allFilterableFieldsMap,
                    item,
                    filterableFieldsByTileUuid,
                );
                const appliesToTabs = getTabsUsingFilter(item);

                if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid)) {
                    return null;
                }

                return field || item.target.isSqlColumn ? (
                    <Filter
                        key={item.id}
                        {...getOrphanedState(item, appliesToTabs)}
                        isTemporary
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        triggerClassName={triggerClassName}
                        dropdownClassName={dropdownClassName}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, true)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(
                                value,
                                index,
                                true,
                                isEditMode,
                            )
                        }
                    />
                ) : (
                    <UnresolvedFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, true)
                        }
                    />
                );
            })}
        </>
    );
};
