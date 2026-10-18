import { ScrollArea, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import scrollAreaClasses from '../../../../styles/ScrollArea.module.css';
import { ConnectionHeader } from '../../components/ConnectionHeader';
import classes from '../../components/Sidebar.module.css';
import { useAppSelector } from '../../store/hooks';
import { SidebarTabs } from '../../store/sqlRunnerSlice';
import { SqlRunnerVizConfigPanel } from '../../viz/SqlRunnerVizConfigPanel';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useRefreshConnectionCatalog } from '../hooks/useConnectionCatalog';
import { ConnectionPicker } from './ConnectionPicker';
import { MultiConnectionTablesPanel } from './MultiConnectionTablesPanel';

export const MultiConnectionSidebar: FC = () => {
    const {
        projectUuid,
        activeConnectionUuid,
        activeConnection,
        hasSeveralConnections,
    } = useActiveConnection();
    const {
        mutate: refreshCatalog,
        isLoading: isRefreshing,
        error,
    } = useRefreshConnectionCatalog(projectUuid, activeConnectionUuid);

    const activeSidebarTab = useAppSelector(
        (state) => state.sqlRunner.activeSidebarTab,
    );
    const isTablesTab = activeSidebarTab === SidebarTabs.TABLES;

    return (
        <Stack gap="sm" className={classes.root}>
            {!isTablesTab && <Title order={4}>Chart</Title>}

            <Stack gap="xs" className={classes.panel} data-active={isTablesTab}>
                {hasSeveralConnections ? (
                    <ConnectionPicker />
                ) : (
                    activeConnection && (
                        <ConnectionHeader
                            name={activeConnection.name}
                            warehouseType={activeConnection.warehouseType}
                            connections={null}
                        />
                    )
                )}
                <MultiConnectionTablesPanel
                    isRefreshing={isRefreshing}
                    refreshError={error?.error.message ?? null}
                    onRefresh={() => refreshCatalog()}
                    isRefreshDisabled={!activeConnectionUuid}
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
