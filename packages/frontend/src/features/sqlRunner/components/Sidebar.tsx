import { ChartKind } from '@lightdash/common';
import {
    ActionIcon,
    Group,
    ScrollArea,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconReload } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { VisualizationConfigPanel } from '../../../components/DataViz/VisualizationConfigPanel';
import { useRefreshTables } from '../hooks/useTables';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setSelectedChartType, SidebarTabs } from '../store/sqlRunnerSlice';
import { TablesPanel } from './TablesPanel';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
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

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group position="apart" p="sm">
                <Group noWrap spacing="xs">
                    <Title order={5} fz="sm" c="gray.6">
                        {activeSidebarTab === SidebarTabs.TABLES
                            ? 'TABLES'
                            : 'VISUALIZATION'}
                    </Title>
                    {activeSidebarTab === SidebarTabs.TABLES && (
                        <Tooltip
                            variant="xs"
                            label="Refresh tables"
                            position="right"
                        >
                            <ActionIcon
                                size="xs"
                                onClick={() => updateTables()}
                            >
                                <MantineIcon icon={IconReload}></MantineIcon>
                            </ActionIcon>
                        </Tooltip>
                    )}
                </Group>
                <Tooltip variant="xs" label="Close sidebar" position="left">
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarLeftCollapse}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Stack
                display={
                    activeSidebarTab === SidebarTabs.TABLES ? 'inherit' : 'none'
                }
                sx={{ flex: 1, overflow: 'hidden' }}
            >
                <TablesPanel
                    isLoading={isLoading}
                    error={error?.error.message || null}
                />
            </Stack>

            <ScrollArea
                offsetScrollbars
                variant="primary"
                className="only-vertical"
                px="sm"
                sx={{
                    flex: 1,
                    display:
                        activeSidebarTab === SidebarTabs.VISUALIZATION
                            ? 'inherit'
                            : 'none',
                }}
            >
                <Stack sx={{ flex: 1, overflow: 'hidden' }}>
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
