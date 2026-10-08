import {
    FilterType,
    getFilterTypeFromItem,
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Paper, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { FilterValueSettings } from './FilterValueSettings';
import { ViewerControls } from './ViewerControls';

type Props = {
    rule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    onChange: (next: DashboardFilterRule) => void;
};

export const FilterSettings: FC<Props> = ({ rule, field, onChange }) => {
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
    const filterType = field ? getFilterTypeFromItem(field) : FilterType.STRING;

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
                <Paper p="md">
                    <Stack gap="sm">
                        <Title order={5}>Default value</Title>
                        <FilterValueSettings
                            filterType={filterType}
                            field={field}
                            filterRule={rule}
                            onChange={onChange}
                        />
                    </Stack>
                </Paper>
                <Paper p="md">
                    <Stack gap="sm">
                        <Title order={5}>Viewer controls</Title>
                        <ViewerControls rule={rule} onChange={onChange} />
                    </Stack>
                </Paper>
            </Stack>
        </FiltersProvider>
    );
};
