import {
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
} from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Card,
    Group,
    Menu,
    Modal,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconDots,
    IconMail,
    IconTrash,
} from '@tabler/icons-react';
import React, { type FC } from 'react';
import useHealth from '../../../hooks/health/useHealth';
import type { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useDeleteOrganizationUserMutation } from '../../../hooks/useOrganizationUsers';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import MantineIcon from '../../common/MantineIcon';

interface UsersActionMenuProps {
    user: OrganizationMemberProfile | OrganizationMemberProfileWithGroups;
    disabled: boolean;
    canInvite: boolean;
    inviteLink: ReturnType<typeof useCreateInviteLinkMutation>;
    onInviteSent: (userUuid: string) => void;
}

const UserNameDisplay: FC<{
    user: OrganizationMemberProfile;
}> = ({ user }) => {
    return (
        <Stack gap="xxs" align="flex-start">
            <Title order={6}>
                {user.firstName
                    ? `${user.firstName} ${user.lastName}`
                    : user.email}
            </Title>
            {user.email && user.firstName && (
                <Text fz="xs" c="ldGray.6">
                    {user.email}
                </Text>
            )}
        </Stack>
    );
};

const UsersActionMenu: FC<UsersActionMenuProps> = ({
    user,
    disabled,
    canInvite,
    inviteLink,
    onInviteSent,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const { mutateAsync, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const { track } = useTracking();
    const health = useHealth();

    const handleDelete = async () => {
        await mutateAsync(user.userUuid);
        setIsDeleteDialogOpen(false);
    };

    const getNewLink = () => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate(
            { email: user.email, role: user.role },
            {
                onSuccess: () => {
                    onInviteSent(user.userUuid);
                },
            },
        );
    };

    const showResendInvite = canInvite && user.isPending;

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
                    <ActionIcon variant="subtle" disabled={disabled}>
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown maw={320}>
                    {showResendInvite && (
                        <>
                            <Menu.Item
                                component="button"
                                role="menuitem"
                                leftSection={<MantineIcon icon={IconMail} />}
                                onClick={getNewLink}
                            >
                                {health.data?.hasEmailClient
                                    ? 'Send new invite'
                                    : 'Get new link'}
                            </Menu.Item>
                            <Menu.Divider />
                        </>
                    )}
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={disabled}
                    >
                        Delete user
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            <Modal
                opened={isDeleteDialogOpen}
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title={
                    <Group gap="xs">
                        <Paper>
                            <MantineIcon icon={IconAlertCircle} color="red" />
                        </Paper>
                        <Title order={4}>Delete user</Title>
                    </Group>
                }
            >
                <Stack gap="xs">
                    <Text>Are you sure you want to delete this user?</Text>
                    <Group gap="xs">
                        <MantineIcon icon={IconAlertCircle} color="gray" />
                        <Text fz="xs" c="ldGray.6" span>
                            Scheduled deliveries created by this user will also
                            be deleted.
                        </Text>
                    </Group>
                    <Card withBorder>
                        <UserNameDisplay user={user} />
                    </Card>
                    <Group gap="xs" justify="right" mt="md">
                        <Button
                            disabled={isDeleting}
                            onClick={() => setIsDeleteDialogOpen(false)}
                            variant="outline"
                            color="dark"
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={isDeleting}
                            color="red"
                        >
                            Delete
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
};

export default UsersActionMenu;
