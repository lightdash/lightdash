import { ActionIcon, Flex, Group, Stack, Title, Tooltip } from '@mantine/core';
import { IconChevronLeft } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { exitView } from '../store/semanticViewerSlice';
import SidebarViewFields from './SidebarViewFields';
import SidebarViews from './SidebarViews';

const Sidebar: FC = () => {
    const { view } = useAppSelector((state) => state.semanticViewer);
    const dispatch = useAppDispatch();

    const handleExitView = () => {
        dispatch(exitView());
    };

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Title order={5} fz="sm" c="gray.6">
                <Group spacing="xs">
                    {view && (
                        <Tooltip
                            variant="xs"
                            label="Back to views"
                            position="left"
                        >
                            <ActionIcon onClick={handleExitView} size="xs">
                                <MantineIcon icon={IconChevronLeft} />
                            </ActionIcon>
                        </Tooltip>
                    )}

                    {!view ? 'Views' : 'Fields'}
                </Group>
            </Title>

            <Flex direction="column" sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {!view ? <SidebarViews /> : <SidebarViewFields />}
            </Flex>
        </Stack>
    );
};

export default Sidebar;
