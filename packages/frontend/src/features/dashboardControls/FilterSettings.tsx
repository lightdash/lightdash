import {
    type DashboardFilterableField,
    type DashboardFilterRule,
} from '@lightdash/common';
import { Paper, Stack, Title } from '@mantine/core';
import { useMemo, type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { useFilterBarPopovers } from '../dashboardFilters/FilterRequirements/useFilterBarPopovers';
import { getFilterRuleType } from './fieldKinds';
import { FilterValueSettings } from './FilterValueSettings';
import { useControlsSidebarSelector } from './useControlsSidebar';
import { useFilterRuleSqlColumnType } from './useFilterRuleField';
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
    // A SQL column filter has no field: its column's type decides the inputs
    const sqlColumnType = useFilterRuleSqlColumnType(rule);
    const filterType = getFilterRuleType(field, sqlColumnType);
    // "Filter rules" opens from its button on the bar, which is only there
    // once the editor has closed
    const close = useControlsSidebarSelector((c) => c.close);
    const updateOtherFilters = useControlsSidebarSelector(
        (c) => c.updateOtherFilters,
    );
    const filterBarPopovers = useFilterBarPopovers();
    const handleEditRules = useMemo(() => {
        if (!filterBarPopovers) return null;
        return () => {
            close();
            filterBarPopovers.openRulesPopover();
        };
    }, [filterBarPopovers, close]);

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
                        <Title order={5}>Viewer access</Title>
                        <ViewerControls
                            rule={rule}
                            filterType={filterType}
                            field={field}
                            onChange={onChange}
                            onChangeOthers={updateOtherFilters}
                            onEditRules={handleEditRules}
                        />
                    </Stack>
                </Paper>
            </Stack>
        </FiltersProvider>
    );
};
