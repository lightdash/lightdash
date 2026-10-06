import {
    FilterType,
    getFilterTypeFromItem,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import FilterSettings from '../dashboardFilters/FilterConfiguration/FilterSettings';

type Props = {
    filterRule: DashboardFilterRule;
    originalFilterRule: DashboardFilterRule | null;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
};

export const Interactivity: FC<Props> = ({
    filterRule,
    originalFilterRule,
    field,
    onChange,
}) => {
    const projectUuid = useProjectUuid();
    const project = useProject(projectUuid);
    const allFilters = useDashboardContext((c) => c.allFilters);
    const allFilterableFieldsMap = useDashboardContext(
        (c) => c.allFilterableFieldsMap,
    );
    const dashboardTiles = useDashboardContext((c) => c.dashboardTiles);
    const parameterValues = useDashboardContext((c) => c.parameterValues);
    const filterableFieldsByTileUuid = useDashboardContext(
        (c) => c.filterableFieldsByTileUuid,
    );
    const activeTabUuid = useDashboardContext((c) => c.activeTab?.uuid);

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
            <FilterSettings
                isEditMode
                isCreatingNew={false}
                filterType={
                    field ? getFilterTypeFromItem(field) : FilterType.STRING
                }
                field={field ?? undefined}
                filterRule={filterRule}
                originalFilterRule={originalFilterRule ?? undefined}
                onChangeFilterRule={onChange}
            />
        </FiltersProvider>
    );
};
