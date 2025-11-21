import { ActionIcon, Menu } from '@mantine-8/core';
import {
    IconDots,
    IconEdit,
    IconSend,
    IconSquarePlus,
    IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { Link } from 'react-router';
import { SchedulerDeleteModal } from '../../features/scheduler';
import ConfirmSendNowModal from '../../features/scheduler/components/ConfirmSendNowModal';
import { useSendNowSchedulerByUuid } from '../../features/scheduler/hooks/useScheduler';
import MantineIcon from '../common/MantineIcon';
import {
    getItemLink,
    getSchedulerLink,
    type SchedulerItem,
} from './SchedulersViewUtils';

interface SchedulersViewActionMenuProps {
    isOpen?: boolean;
    onOpen?: () => void;
    onClose?: () => void;
    item: SchedulerItem;
    projectUuid: string;
}

const SchedulersViewActionMenu: FC<SchedulersViewActionMenuProps> = ({
    item,
    projectUuid,
}) => {
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
    const queryClient = useQueryClient();

    const sendNowMutation = useSendNowSchedulerByUuid(item.schedulerUuid);

    const handleDelete = async () => {
        setIsDeleting(false);
        await queryClient.invalidateQueries(['schedulerLogs']);
    };

    return (
        <>
            <Menu
                withinPortal
                position="bottom-start"
                withArrow
                arrowPosition="center"
                shadow="md"
                offset={-4}
                closeOnItemClick
                closeOnClickOutside
            >
                <Menu.Target>
                    <ActionIcon variant="subtle">
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown maw={320}>
                    <Menu.Item
                        component={Link}
                        role="menuitem"
                        leftSection={<MantineIcon icon={IconEdit} />}
                        to={getSchedulerLink(item, projectUuid)}
                    >
                        Edit schedule
                    </Menu.Item>
                    <Menu.Item
                        component={Link}
                        role="menuitem"
                        leftSection={<MantineIcon icon={IconSquarePlus} />}
                        to={getItemLink(item, projectUuid)}
                    >
                        Go to {item.savedChartUuid ? 'chart' : 'dashboard'}
                    </Menu.Item>
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        leftSection={<MantineIcon icon={IconSend} />}
                        onClick={() => setIsConfirmOpen(true)}
                    >
                        Send now
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => setIsDeleting(true)}
                    >
                        Delete schedule
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            {isDeleting && (
                <SchedulerDeleteModal
                    opened={isDeleting}
                    schedulerUuid={item.schedulerUuid}
                    onConfirm={handleDelete}
                    onClose={handleDelete}
                />
            )}
            <ConfirmSendNowModal
                opened={isConfirmOpen}
                onClose={() => setIsConfirmOpen(false)}
                schedulerName={item.name}
                loading={sendNowMutation.isLoading}
                onConfirm={() => {
                    sendNowMutation.mutate();
                    setIsConfirmOpen(false);
                }}
            />
        </>
    );
};

export default SchedulersViewActionMenu;
