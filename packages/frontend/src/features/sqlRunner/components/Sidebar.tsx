import { ScrollArea, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import { useProject } from '../../../hooks/useProject';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useRefreshTables } from '../hooks/useTables';
import { useAppSelector } from '../store/hooks';
import { SidebarTabs } from '../store/sqlRunnerSlice';
import { SqlRunnerVizConfigPanel } from '../viz/SqlRunnerVizConfigPanel';
import { ConnectionHeader } from './ConnectionHeader';
import classes from './Sidebar.module.css';
import { TablesPanel } from './TablesPanel';

export const Sidebar: FC = () => {
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const { data: project } = useProject(projectUuid);

    const {
        mutate: updateTables,
        isLoading,
        error,
    } = useRefreshTables({ projectUuid });

    const activeSidebarTab = useAppSelector(
        (state) => state.sqlRunner.activeSidebarTab,
    );
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
                    {!isTablesTab && <SqlRunnerVizConfigPanel />}
                </Stack>
            </ScrollArea>
        </Stack>
    );
};
