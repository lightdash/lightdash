import { ChartKind } from '@lightdash/common';
import { ScrollArea, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import { VisualizationConfigPanel } from '../../../components/DataViz/VisualizationConfigPanel';
import { useProject } from '../../../hooks/useProject';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useRefreshTables } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedChartType, SidebarTabs } from '../store/sqlRunnerSlice';
import { ConnectionHeader } from './ConnectionHeader';
import classes from './Sidebar.module.css';
import { TablesPanel } from './TablesPanel';

export const Sidebar: FC = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);

    const {
        mutate: updateTables,
        isLoading,
        error,
    } = useRefreshTables({ projectUuid });

    const selectedChartType = useAppSelector(
        (state) => state.sqlRunner.selectedChartType,
    );
    const activeSidebarTab = useAppSelector(
        (state) => state.sqlRunner.activeSidebarTab,
    );
    const sqlColumns = useAppSelector((state) => state.sqlRunner.sqlColumns);
    const isTablesTab = activeSidebarTab === SidebarTabs.TABLES;

    return (
        <Stack gap="sm" className={classes.root}>
            {!isTablesTab && <Title order={4}>Chart</Title>}

            <Stack gap="xs" className={classes.panel} data-active={isTablesTab}>
                {project && (
                    <ConnectionHeader
                        name={project.name}
                        warehouseType={
                            project.warehouseConnection?.type ?? null
                        }
                        connections={null}
                    />
                )}
                <TablesPanel
                    isLoading={isLoading}
                    error={error?.error.message || null}
                    onRefresh={() => updateTables()}
                />
            </Stack>

            <ScrollArea
                offsetScrollbars
                scrollbars="y"
                classNames={{ content: scrollAreaClasses.verticalContent }}
                className={classes.panel}
                data-active={!isTablesTab}
            >
                <Stack className={classes.panel}>
                    <VisualizationConfigPanel
                        selectedChartType={selectedChartType || ChartKind.TABLE}
                        setSelectedChartType={(value) =>
                            dispatch(setSelectedChartType(value))
                        }
                        columns={sqlColumns || []}
                    />
                </Stack>
            </ScrollArea>
        </Stack>
    );
};
