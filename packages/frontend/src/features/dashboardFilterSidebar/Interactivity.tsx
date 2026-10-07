import {
    type DashboardFilterableField,
    type DashboardFilterRule,
    type FilterType,
} from '@lightdash/common';
import { Paper, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import FiltersProvider from '../../components/common/Filters/FiltersProvider';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import { FilterValueSettings } from './FilterValueSettings';
import { InteractivityQuestions } from './InteractivityQuestions';

type Props = {
    attemptedApply: boolean;
    filterRule: DashboardFilterRule;
    field: DashboardFilterableField | null;
    /** The filter's kind, known even before it has a field. */
    kind: FilterType;
    onChange: (next: DashboardFilterRule) => void;
};

export const Interactivity: FC<Props> = ({
    filterRule,
    field,
    kind,
    onChange,
    attemptedApply,
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
            <Stack gap="md">
                <Paper p="md">
                    <Stack gap="sm">
                        <Title order={5}>Default value</Title>
                        <FilterValueSettings
                            filterType={kind}
                            field={field}
                            filterRule={filterRule}
                            attemptedApply={attemptedApply}
                            onChange={onChange}
                        />
                    </Stack>
                </Paper>
                <Paper p="md">
                    <Stack gap="sm">
                        <Title order={5}>Viewer controls</Title>
                        <InteractivityQuestions
                            subject={{
                                kind: 'filter',
                                rule: filterRule,
                                filterType: kind,
                                onChange,
                            }}
                            field={field}
                        />
                    </Stack>
                </Paper>
            </Stack>
        </FiltersProvider>
    );
};
