import { ActionIcon, Group, Stack, Title, Tooltip } from '@mantine/core';
import { IconLayoutSidebarLeftCollapse } from '@tabler/icons-react';
import { type Dispatch, type FC, type SetStateAction } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TablesPanel } from './TablesPanel';

type Props = {
    setSidebarOpen: Dispatch<SetStateAction<boolean>>;
};

export const Sidebar: FC<Props> = ({ setSidebarOpen }) => {
    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group position="apart">
                <Title order={5} fz="sm" c="gray.6">
                    TABLES
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

            <Stack display="inherit" sx={{ flex: 1, overflow: 'hidden' }}>
                <TablesPanel />
            </Stack>
        </Stack>
    );
};
