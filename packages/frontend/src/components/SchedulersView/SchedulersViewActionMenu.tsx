import { subject } from '@casl/ability';
import { SchedulerFormat } from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine-8/core';
import { useDisclosure } from '@mantine-8/hooks';
import {
    IconCode,
    IconDots,
    IconEdit,
    IconSend,
    IconSquarePlus,
    IconTrash,
    IconUserEdit,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React, { type FC } from 'react';
import { Link } from 'react-router';
import ScheduledDeliveryAsCodeModal from '../../features/contentAsCode/components/ScheduledDeliveryAsCodeModal';
import { SchedulerDeleteModal } from '../../features/scheduler';
import ConfirmSendNowModal from '../../features/scheduler/components/ConfirmSendNowModal';
import { getSchedulerDeliveryType } from '../../features/scheduler/components/types';
import { useSendNowSchedulerByUuid } from '../../features/scheduler/hooks/useScheduler';
import useApp from '../../providers/App/useApp';
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
    projectUuid?: string | null;
    organizationUuid?: string | null;
    onReassignOwner?: (
        schedulerUuid: string,
        ownerUuid: string | undefined,
    ) => void;
    hideReassign?: boolean;
}

const SchedulersViewActionMenu: FC<SchedulersViewActionMenuProps> = ({
    item,
    projectUuid,
    organizationUuid,
    onReassignOwner,
    hideReassign = false,
}) => {
    const [isDeleting, setIsDeleting] = React.useState(false);
    const [isConfirmOpen, setIsConfirmOpen] = React.useState(false);
    const [isAsCodeOpen, asCodeModalHandlers] = useDisclosure(false);
    const queryClient = useQueryClient();
    const { user } = useApp();

    const contentAsCodeSubject =
        projectUuid && organizationUuid
            ? subject('ContentAsCode', { projectUuid, organizationUuid })
            : undefined;
    const scheduledDeliveriesSubject =
        projectUuid && organizationUuid
            ? subject('ScheduledDeliveries', {
                  projectUuid,
                  organizationUuid,
              })
            : undefined;
    const isScheduledDelivery =
        !item.thresholds?.length &&
        item.format !== SchedulerFormat.GSHEETS &&
        Boolean(item.slug);
    const userCanViewAsCode =
        contentAsCodeSubject &&
        scheduledDeliveriesSubject &&
        user.data?.ability.can('view', contentAsCodeSubject) &&
        user.data.ability.can('manage', scheduledDeliveriesSubject);

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
                    <ActionIcon variant="subtle" color="gray">
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
                        Go to{' '}
                        {item.savedChartUuid || item.savedSqlUuid
                            ? 'chart'
                            : 'dashboard'}
                    </Menu.Item>
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        leftSection={<MantineIcon icon={IconSend} />}
                        onClick={() => setIsConfirmOpen(true)}
                    >
                        Send now
                    </Menu.Item>
                    {isScheduledDelivery && userCanViewAsCode && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={<MantineIcon icon={IconCode} />}
                            onClick={asCodeModalHandlers.open}
                        >
                            View as code
                        </Menu.Item>
                    )}
                    {!hideReassign && (
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={<MantineIcon icon={IconUserEdit} />}
                            onClick={() =>
                                onReassignOwner?.(
                                    item.schedulerUuid,
                                    item.createdBy,
                                )
                            }
                        >
                            Reassign owner
                        </Menu.Item>
                    )}
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
                deliveryType={getSchedulerDeliveryType(item)}
                loading={sendNowMutation.isLoading}
                onConfirm={() => {
                    sendNowMutation.mutate();
                    setIsConfirmOpen(false);
                }}
            />
            {projectUuid && isAsCodeOpen && (
                <ScheduledDeliveryAsCodeModal
                    opened={isAsCodeOpen}
                    onClose={asCodeModalHandlers.close}
                    projectUuid={projectUuid}
                    deliverySlug={item.slug}
                />
            )}
        </>
    );
};

export default SchedulersViewActionMenu;
