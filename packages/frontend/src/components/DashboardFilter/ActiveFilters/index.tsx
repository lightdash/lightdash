import {
    getDashboardFilterRulesForTile,
    isTileFilterable,
    type DashboardFilters,
} from '@lightdash/common';
import { Group, Skeleton } from '@mantine/core';
import { useCallback, type FC } from 'react';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import Filter from '../Filter';
import InvalidFilter from '../InvalidFilter';

interface ActiveFiltersProps {
    isEditMode: boolean;
    activeTabUuid: string | undefined;
    openPopoverId: string | undefined;
    onPopoverOpen: (popoverId: string) => void;
    onPopoverClose: () => void;
}

const ActiveFilters: FC<ActiveFiltersProps> = ({
    isEditMode,
    activeTabUuid,
    openPopoverId,
    onPopoverOpen,
    onPopoverClose,
}) => {
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const dashboardFilters = useDashboardContext((c) => c.dashboardFilters);
    const dashboardTemporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const isLoadingDashboardFilters = useDashboardContext(
        (c) => c.isLoadingDashboardFilters,
    );
    const isFetchingDashboardFilters = useDashboardContext(
        (c) => c.isFetchingDashboardFilters,
    );
    const removeDimensionDashboardFilter = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );

    const makeTabGetter = useCallback(
        (filters: DashboardFilters) => {
            return (filterId: string) => {
                return (
                    dashboardTiles?.reduce((acc, tile) => {
                        if (!isTileFilterable(tile)) return acc;
                        const filtersForTile = getDashboardFilterRulesForTile(
                            tile.uuid,
                            filters.dimensions,
                        );
                        const filterIdsForTile = filtersForTile.map(
                            (tileFilter) => tileFilter.id,
                        );
                        if (
                            tile.tabUuid &&
                            filterIdsForTile.includes(filterId) &&
                            !acc.includes(tile.tabUuid)
                        ) {
                            acc.push(tile.tabUuid);
                        }
                        return acc;
                    }, [] as string[]) || []
                );
            };
        },
        [dashboardTiles],
    );

    const getTabsUsingFilter = useCallback(
        (filterId: string) => makeTabGetter(dashboardFilters)(filterId),
        [makeTabGetter, dashboardFilters],
    );

    const getTabsUsingTemporaryFilter = useCallback(
        (filterId: string) =>
            makeTabGetter(dashboardTemporaryFilters)(filterId),
        [makeTabGetter, dashboardTemporaryFilters],
    );

    if (isLoadingDashboardFilters || isFetchingDashboardFilters) {
        return (
            <Group spacing="xs" ml="xs">
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
                <Skeleton h={30} w={100} radius={4} />
            </Group>
        );
    }

    if (!allFilterableFieldsMap) return null;

    return (
        <>
            {dashboardFilters.dimensions.map((item, index) => {
                const field = allFilterableFieldsMap[item.target.fieldId];
                const appliesToTabs = getTabsUsingFilter(item.id);
                return field ? (
                    <Filter
                        key={item.id}
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        activeTabUuid={activeTabUuid}
                        appliesToTabs={appliesToTabs}
                        openPopoverId={openPopoverId}
                        onPopoverOpen={onPopoverOpen}
                        onPopoverClose={onPopoverClose}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                        onUpdate={(value) =>
                            updateDimensionDashboardFilter(
                                value,
                                index,
                                false,
                                isEditMode,
                            )
                        }
                    />
                ) : (
                    <InvalidFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                    />
                );
            })}

            {dashboardTemporaryFilters.dimensions.map((item, index) => {
                const field = allFilterableFieldsMap[item.target.fieldId];
                const appliesToTabs = getTabsUsingTemporaryFilter(item.id);
                return field ? (
                    <Filter
                        key={item.id}
                        isTemporary
                        isEditMode={isEditMode}
                        field={field}
                        filterRule={item}
                        activeTabUuid={activeTabUuid}
                        appliesToTabs={appliesToTabs}
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
                    <InvalidFilter
                        key={item.id}
                        isEditMode={isEditMode}
                        filterRule={item}
                        onRemove={() =>
                            removeDimensionDashboardFilter(index, false)
                        }
                    />
                );
            })}
        </>
    );
};

export default ActiveFilters;
