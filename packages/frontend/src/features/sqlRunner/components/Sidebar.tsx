import {
    ActionIcon,
    Group,
    LoadingOverlay,
    ScrollArea,
    Stack,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconLayoutSidebarLeftCollapse, IconReload } from '@tabler/icons-react';
import {
    useCallback,
    type Dispatch,
    type FC,
    type SetStateAction,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useRefreshTables } from '../hooks/useTables';
import { useAppSelector } from '../store/hooks';
import { SidebarTabs } from '../store/sqlRunnerSlice';
import { TablesPanel } from './TablesPanel';
import { VisualizationConfigPanel } from './VisualizationConfigPanel';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
    const activeSidebarTab = useAppSelector(
        (state) => state.sqlRunner.activeSidebarTab,
    );
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);

    const {
        mutate,
        // TODO: unify this loading with the one in TablesPanel, handle error
        isLoading,
    } = useRefreshTables({ projectUuid });

    const handleRefresh = useCallback(() => {
        mutate();
    }, [mutate]);

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group position="apart">
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
                            <ActionIcon size="xs" onClick={handleRefresh}>
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
                <LoadingOverlay visible={isLoading} />
                <TablesPanel />
            </Stack>

            <ScrollArea
                offsetScrollbars
                variant="primary"
                className="only-vertical"
                sx={{
                    flex: 1,
                    display:
                        activeSidebarTab === SidebarTabs.VISUALIZATION
                            ? 'inherit'
                            : 'none',
                }}
            >
                <Stack sx={{ flex: 1, overflow: 'hidden' }}>
                    <VisualizationConfigPanel />
                </Stack>
            </ScrollArea>
        </Stack>
    );
};
