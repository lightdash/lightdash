import {
    getDashboardFilterField,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { useCallback, useState, type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import Filter from '../dashboardFilters/ActiveFilters/Filter';
import InvalidFilter from '../dashboardFilters/InvalidFilter';
import LockedFilter from '../dashboardFilters/LockedFilter';
import { useIsLockedDashboardFilterRule } from '../dashboardFilters/useIsLockedDashboardFilterRule';
import { getFilterPillPlacement, type FilterPillGroup } from './pillState';

type Props = {
    activeTabUuid: string | undefined;
    sortedTabUuids: string[];
};

// Rules added from a tile or the URL are never saved; the shipped pill shows
// and edits them, so it is rendered as is
const TemporaryPills: FC<Props> = ({ activeTabUuid, sortedTabUuids }) => {
    const getUiString = useUiStrings();
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const [openPopoverId, setOpenPopoverId] = useState<string>();
    const closePopover = useCallback(() => setOpenPopoverId(undefined), []);

    const temporaryFilters = useDashboardContext(
        (c) => c.dashboardTemporaryFilters,
    );
    const allFilters = useDashboardContext((c) => c.allFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const removeDimension = useDashboardContext(
        (c) => c.removeDimensionDashboardFilter,
    );
    const updateDimension = useDashboardContext(
        (c) => c.updateDimensionDashboardFilter,
    );
    const removeMetric = useDashboardContext(
        (c) => c.removeMetricDashboardFilter,
    );
    const updateMetric = useDashboardContext(
        (c) => c.updateMetricDashboardFilter,
    );
    const allFilterableMetricsMap = useDashboardContext(
        (c) => c.allFilterableMetricsMap,
    );
    const isHiddenFieldRule = useIsLockedDashboardFilterRule();

    const renderPill = (
        rule: DashboardFilterRule,
        index: number,
        group: FilterPillGroup,
    ) => {
        const placement = getFilterPillPlacement(rule, {
            dashboardTiles,
            sortedTabUuids,
            filterableFieldsByTileUuid,
            activeTabUuid,
        });
        if (!placement.isOnActiveTab && !placement.isOnNoTab) return null;

        const remove = group === 'metrics' ? removeMetric : removeDimension;
        const update = group === 'metrics' ? updateMetric : updateDimension;
        const field = getDashboardFilterField<DashboardFilterableField>(
            group === 'metrics'
                ? allFilterableMetricsMap
                : allFilterableFieldsMap,
            rule,
            filterableFieldsByTileUuid,
        );
        if (!field && !rule.target.isSqlColumn) {
            const Unresolved = isHiddenFieldRule(rule)
                ? LockedFilter
                : InvalidFilter;
            return (
                <Unresolved
                    key={rule.id}
                    isEditMode
                    filterRule={rule}
                    onRemove={() => remove(index, true)}
                />
            );
        }
        return (
            <Filter
                key={rule.id}
                isTemporary
                isEditMode
                isOrphaned={placement.isOrphaned}
                orphanedTooltip={getUiString(placement.orphanedTooltipKey)}
                field={field}
                filterRule={rule}
                openPopoverId={openPopoverId}
                onPopoverOpen={setOpenPopoverId}
                onPopoverClose={closePopover}
                onRemove={() => remove(index, true)}
                onUpdate={(next) => update(next, index, true, true)}
            />
        );
    };

    return (
        <FiltersProvider
            projectUuid={projectUuid}
            itemsMap={allFilterableFieldsMap}
            startOfWeek={
                project.data?.warehouseConnection?.startOfWeek ?? undefined
            }
            dashboardFilters={allFilters}
            dashboardTiles={dashboardTiles}
            filterableFieldsByTileUuid={filterableFieldsByTileUuid}
            activeTabUuid={activeTabUuid}
            parameterValues={parameterValues}
        >
            {temporaryFilters.metrics.map((rule, index) =>
                renderPill(rule, index, 'metrics'),
            )}
            {temporaryFilters.dimensions.map((rule, index) =>
                renderPill(rule, index, 'dimensions'),
            )}
        </FiltersProvider>
    );
};

export const TemporaryFilterPills: FC<Props> = (props) => {
    const hasTemporaryFilters = useDashboardContext(
        (c) =>
            c.dashboardTemporaryFilters.dimensions.length > 0 ||
            c.dashboardTemporaryFilters.metrics.length > 0,
    );
    return hasTemporaryFilters ? <TemporaryPills {...props} /> : null;
};
