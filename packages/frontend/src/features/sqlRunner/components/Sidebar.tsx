import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    ScrollArea,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconReload } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { VisualizationConfigPanel } from '../../../components/DataViz/VisualizationConfigPanel';
import scrollAreaClasses from '../../../styles/ScrollArea.module.css';
import { useRefreshTables } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedChartType, SidebarTabs } from '../store/sqlRunnerSlice';
import classes from './Sidebar.module.css';
import { TablesPanel } from './TablesPanel';

export const Sidebar: FC = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);

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
            <Group justify="space-between" wrap="nowrap" gap="xs">
                <Title order={4}>{isTablesTab ? 'Tables' : 'Chart'}</Title>
                {isTablesTab && (
                    <Tooltip label="Refresh tables" position="right">
                        <ActionIcon size="sm" onClick={() => updateTables()}>
                            <MantineIcon icon={IconReload} />
                        </ActionIcon>
                    </Tooltip>
                )}
            </Group>

            <Stack className={classes.panel} data-active={isTablesTab}>
                <TablesPanel
                    isLoading={isLoading}
                    error={error?.error.message || null}
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
