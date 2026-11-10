import { ChartKind } from '@lightdash/common';
import { ScrollArea, Stack, Title } from '@mantine/core';
import { type FC } from 'react';
import { VisualizationConfigPanel } from '../../../../components/DataViz/VisualizationConfigPanel';
import scrollAreaClasses from '../../../../styles/ScrollArea.module.css';
import { ConnectionHeader } from '../../components/ConnectionHeader';
import classes from '../../components/Sidebar.module.css';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { setSelectedChartType, SidebarTabs } from '../../store/sqlRunnerSlice';
import { useActiveConnection } from '../hooks/useActiveConnection';
import { useRefreshConnectionCatalog } from '../hooks/useConnectionCatalog';
import { ConnectionPicker } from './ConnectionPicker';
import { MultiConnectionTablesPanel } from './MultiConnectionTablesPanel';

export const MultiConnectionSidebar: FC = () => {
    const dispatch = useAppDispatch();
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
