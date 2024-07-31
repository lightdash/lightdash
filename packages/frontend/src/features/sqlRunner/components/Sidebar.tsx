import { ActionIcon, Group, Stack, Title, Tooltip } from '@mantine/core';
import { IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import { ConditionalVisibility } from '../../../components/common/ConditionalVisibility';
import MantineIcon from '../../../components/common/MantineIcon';
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

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    {activeSidebarTab === SidebarTabs.TABLES
                        ? 'TABLES'
                        : 'VISUALIZATION'}
                </Title>
                <Tooltip variant="xs" label="Close sidebar" position="left">
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarLeftCollapse}
                            onClick={() => setSidebarOpen(false)}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <ConditionalVisibility
                isVisible={activeSidebarTab === SidebarTabs.TABLES}
            >
                <Stack sx={{ flex: 1, overflow: 'hidden' }}>
                    <TablesPanel />
                </Stack>
            </ConditionalVisibility>

            <ConditionalVisibility
                isVisible={activeSidebarTab === SidebarTabs.VISUALIZATION}
            >
                <Stack sx={{ flex: 1, overflow: 'hidden' }}>
                    <VisualizationConfigPanel />
                </Stack>
            </ConditionalVisibility>
        </Stack>
    );
};
