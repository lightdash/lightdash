import { ActionIcon, Flex, Group, Stack, Title, Tooltip } from '@mantine/core';
import {
    IconChevronLeft,
    IconLayoutSidebarLeftCollapse,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { exitView } from '../store/semanticViewerSlice';
import SidebarViewFields from './SidebarViewFields';
import SidebarViews from './SidebarViews';

type Props = {
    onSidebarClose: () => void;
};

const Sidebar: FC<Props> = ({ onSidebarClose }) => {
    const { view } = useAppSelector((state) => state.semanticViewer);
    const dispatch = useAppDispatch();

    const handleExitView = () => {
        dispatch(exitView());
    };

    return (
        <Stack spacing="xs" sx={{ flex: 1, overflow: 'hidden' }}>
            <Group position="apart">
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

                <Tooltip variant="xs" label="Close sidebar" position="left">
                    <ActionIcon size="xs">
                        <MantineIcon
                            icon={IconLayoutSidebarLeftCollapse}
                            onClick={() => onSidebarClose()}
                        />
                    </ActionIcon>
                </Tooltip>
            </Group>

            <Flex direction="column" sx={{ flexGrow: 1, overflowY: 'auto' }}>
                {!view ? <SidebarViews /> : <SidebarViewFields />}
            </Flex>
        </Stack>
    );
};

export default Sidebar;
