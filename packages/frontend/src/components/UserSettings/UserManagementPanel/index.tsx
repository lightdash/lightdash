import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Button,
    Flex,
    Group,
    Modal,
    Select,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconCircleX,
    IconInfoCircle,
} from '@tabler/icons-react';
import { FC, useState } from 'react';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import {
    useDeleteOrganizationUserMutation,
    useOrganizationUsers,
    useUpdateUserMutation,
} from '../../../hooks/useOrganizationUsers';
import { useApp } from '../../../providers/AppProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import LoadingState from '../../common/LoadingState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import InvitesModal from '../InvitesModal';
import InviteSuccess from './InviteSuccess';

const UserListItem: FC<{
    disabled: boolean;
    user: OrganizationMemberProfile;
}> = ({
    disabled,
    user: {
        userUuid,
        firstName,
        lastName,
        email,
        role,
        isActive,
        isInviteExpired,
    },
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const { mutate, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const inviteLink = useCreateInviteLinkMutation();
    const { track } = useTracking();
    const { user, health } = useApp();
    const updateUser = useUpdateUserMutation(userUuid);
    const handleDelete = () => mutate(userUuid);

    const getNewLink = () => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate({ email, role });
    };

    return (
        <SettingsCard shadow="sm">
            <Stack spacing="md">
                <Flex justify="space-between" align="center">
                    {isActive ? (
                        <Stack spacing="xxs">
                            <Title order={6}>
                                {firstName} {lastName}
                            </Title>

                            {email && (
                                <Badge
                                    variant="filled"
                                    color="gray.2"
                                    radius="xs"
                                    sx={{ textTransform: 'none' }}
                                    px="xxs"
                                >
                                    <Text fz="xs" fw={400} color="gray.8">
                                        {email}
                                    </Text>
                                </Badge>
                            )}
                        </Stack>
                    ) : (
                        <Stack spacing="xxs">
                            {email && <Title order={6}>{email}</Title>}
                            <Group spacing="xs">
                                <Badge
                                    variant="filled"
                                    color="orange.3"
                                    radius="xs"
                                    sx={{ textTransform: 'none' }}
                                    px="xxs"
                                >
                                    <Text fz="xs" fw={400} color="gray.8">
                                        {!isInviteExpired
                                            ? 'Pending'
                                            : 'Link expired'}
                                    </Text>
                                </Badge>
                                {user.data?.ability?.can(
                                    'create',
                                    'InviteLink',
                                ) && (
                                    <Anchor
                                        component="button"
                                        onClick={getNewLink}
                                        size="xs"
                                        fw={500}
                                    >
                                        {health.data?.hasEmailClient
                                            ? 'Send new invite'
                                            : 'Get new link'}
                                    </Anchor>
                                )}
                            </Group>
                        </Stack>
                    )}
                    {user.data?.ability?.can(
                        'manage',
                        'OrganizationMemberProfile',
                    ) && (
                        <Group spacing="xs">
                            <Select
                                data={Object.values(OrganizationMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: orgMemberRole.replace('_', ' '),
                                    }),
                                )}
                                onChange={(newRole: string) => {
                                    updateUser.mutate({
                                        role: newRole as OrganizationMemberRole,
                                    });
                                }}
                                value={role}
                            />
                            <Button
                                leftIcon={<MantineIcon icon={IconCircleX} />}
                                variant="outline"
                                onClick={() => setIsDeleteDialogOpen(true)}
                                disabled={disabled}
                                color="red"
                            >
                                Delete
                            </Button>
                        </Group>
                    )}
                </Flex>
                {inviteLink.data && <InviteSuccess invite={inviteLink.data} />}
            </Stack>
            <Modal
                opened={isDeleteDialogOpen}
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title={
                    <Group spacing="xs">
                        <MantineIcon
                            size="lg"
                            icon={IconAlertCircle}
                            color="red"
                        />
                        <Title order={4}>Delete user</Title>
                    </Group>
                }
                yOffset="30vh"
            >
                <Text pb="md">Are you sure you want to delete this user ?</Text>
                <Group spacing="xs" position="right">
                    <Button
                        disabled={isDeleting}
                        onClick={() => setIsDeleteDialogOpen(false)}
                        variant="outline"
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
            </Modal>
        </SettingsCard>
    );
};

const UserManagementPanel: FC = () => {
    const { user } = useApp();
    const [showInviteModal, setShowInviteModal] = useState(false);
    const { data: organizationUsers, isLoading } = useOrganizationUsers();

    return (
        <>
            {user.data?.ability?.can('create', 'InviteLink') && (
                <Group position="apart" pb="md">
                    <Group spacing="two">
                        <Title order={5}>User management settings</Title>
                        <Tooltip label="Click here to learn more about user roles">
                            <ActionIcon
                                component="a"
                                href="https://docs.lightdash.com/references/roles"
                                target="_blank"
                                rel="noreferrer"
                            >
                                <MantineIcon icon={IconInfoCircle} />
                            </ActionIcon>
                        </Tooltip>
                    </Group>
                    <Button onClick={() => setShowInviteModal(true)}>
                        Add user
                    </Button>
                    <InvitesModal
                        opened={showInviteModal}
                        onClose={() => setShowInviteModal(false)}
                    />
                </Group>
            )}
            {isLoading ? (
                <LoadingState title="Loading users" />
            ) : (
                <Stack>
                    {organizationUsers?.map((orgUser) => (
                        <UserListItem
                            key={orgUser.email}
                            user={orgUser}
                            disabled={
                                user.data?.userUuid === orgUser.userUuid ||
                                organizationUsers.length <= 1
                            }
                        />
                    ))}
                </Stack>
            )}
        </>
    );
};

export default UserManagementPanel;
