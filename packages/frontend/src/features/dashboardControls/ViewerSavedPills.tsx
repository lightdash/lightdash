import {
    getDashboardFilterField,
    type DashboardFilterableField,
} from '@lightdash/common';
import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import {
    selectDashboardFilters,
    selectDashboardTiles,
    selectParameterValues,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../dashboard/store';
import Filter from '../dashboardFilters/ActiveFilters/Filter';
import { UnresolvedFilter } from '../dashboardFilters/ActiveFilters/UnresolvedFilter';
import {
    isFilterHiddenOnTab,
    useFilterTabPlacement,
} from '../dashboardFilters/ActiveFilters/useFilterTabPlacement';
import { useFiltersStartOfWeek } from './useFiltersStartOfWeek';

type Props = {
    activeTabUuid: string | undefined;
    triggerClassName: string | undefined;
    dropdownClassName: string | undefined;
};

type Group = 'dimensions' | 'metrics';
const GROUPS: Group[] = ['dimensions', 'metrics'];

// A viewer's saved filters are the shipped view-mode pills, each with the
// shipped popover: value only, Apply writes the `filters` URL override
export const ViewerSavedPills: FC<Props> = ({
    activeTabUuid,
    triggerClassName,
    dropdownClassName,
}) => {
    const projectUuid = useProjectUuid();
    const startOfWeek = useFiltersStartOfWeek(projectUuid);
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const closePopover = useCallback(() => setOpenPopoverId(undefined), []);

    const dashboardFilters = useDashboardSelector(selectDashboardFilters);
    const allFilters = useDashboardAllFilters();
    const dashboardTiles = useDashboardSelector(selectDashboardTiles);
    const parameterValues = useDashboardSelector(selectParameterValues);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const updateDimensionDashboardFilter = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const updateMetricDashboardFilter = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );
    const removeDimensionDashboardFilter = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );
    const removeMetricDashboardFilter = useDashboardContext(
        (c) => c.removeMetricDashboardFilter,
    );
    const { getTabsUsingFilter, getOrphanedState } = useFilterTabPlacement();

    // As the shipped bar: nothing until the fields exist
    if (!allFilterableFieldsMap) return null;

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={startOfWeek}
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            {GROUPS.flatMap((group) =>
                dashboardFilters[group].map((item, index) => {
                    const appliesToTabs = getTabsUsingFilter(item);
                    if (isFilterHiddenOnTab(appliesToTabs, activeTabUuid))
                        return null;
                    const field =
                        getDashboardFilterField<DashboardFilterableField>(
                            group === 'metrics'
                                ? allFilterableMetricsMap
                                : allFilterableFieldsMap,
                            item,
                            filterableFieldsByTileUuid,
                        );
                    const remove = () =>
                        group === 'metrics'
                            ? removeMetricDashboardFilter(index, false)
                            : removeDimensionDashboardFilter(index, false);
                    if (!field && !item.target.isSqlColumn)
                        return (
                            <UnresolvedFilter
                                key={item.id}
                                isEditMode={false}
                                filterRule={item}
                                onRemove={remove}
                            />
                        );
                    return (
                        <Filter
                            key={item.id}
                            isEditMode={false}
                            {...getOrphanedState(item, appliesToTabs)}
                            field={field}
                            filterRule={item}
                            triggerClassName={triggerClassName}
                            dropdownClassName={dropdownClassName}
                            openPopoverId={openPopoverId}
                            onPopoverOpen={setOpenPopoverId}
                            onPopoverClose={closePopover}
                            onRemove={remove}
                            onUpdate={(value) =>
                                (group === 'metrics'
                                    ? updateMetricDashboardFilter
                                    : updateDimensionDashboardFilter)(
                                    value,
                                    index,
                                    false,
                                    false,
                                )
                            }
                        />
                    );
                }),
            )}
        </FiltersProvider>
    );
};
