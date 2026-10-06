import {
    FilterType,
    getFilterTypeFromItem,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Stack } from '@mantine/core';
import { type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { FilterValueSettings } from './FilterValueSettings';
import { InteractivityQuestions } from './InteractivityQuestions';

type Props = {
    filterRule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
};

export const Interactivity: FC<Props> = ({ filterRule, field, onChange }) => {
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
            <Stack gap="md">
                <FilterValueSettings
                    filterType={
                        field ? getFilterTypeFromItem(field) : FilterType.STRING
                    }
                    field={field}
                    filterRule={filterRule}
                    onChange={onChange}
                />
                <InteractivityQuestions
                    filterRule={filterRule}
                    field={field}
                    onChange={onChange}
                />
            </Stack>
        </FiltersProvider>
    );
};
