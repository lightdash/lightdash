import {
    getRoleDescription,
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
    Table,
    Tabs,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconHelp,
    IconInfoCircle,
    IconPlus,
    IconTrash,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { FC, useState } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import { useOrganizationGroups } from '../../../hooks/useOrganizationGroups';
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
import ForbiddenPanel from '../../ForbiddenPanel';
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
    const [showInviteSuccess, setShowInviteSuccess] = useState(true);
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
        setShowInviteSuccess(true);
    };

    return (
        <>
            <tr>
                <td width={500}>
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
                    </Flex>
                </td>
                {user.data?.ability?.can(
                    'manage',
                    'OrganizationMemberProfile',
                ) && (
                    <>
                        <td>
                            <Select
                                data={Object.values(OrganizationMemberRole).map(
                                    (orgMemberRole) => ({
                                        value: orgMemberRole,
                                        label: capitalize(
                                            orgMemberRole.replace('_', ' '),
                                        ),
                                        description:
                                            getRoleDescription(orgMemberRole),
                                    }),
                                )}
                                onChange={(newRole: string) => {
                                    updateUser.mutate({
                                        role: newRole as OrganizationMemberRole,
                                    });
                                }}
                                value={role}
                                w={200}
                                itemComponent={({
                                    label,
                                    description,
                                    ...props
                                }) => (
                                    <Group {...props} spacing="two">
                                        <Text>{label}</Text>
                                        <Tooltip
                                            multiline
                                            label={description}
                                            sx={{
                                                wordBreak: 'break-word',
                                            }}
                                        >
                                            <MantineIcon
                                                icon={IconHelp}
                                                color="gray.6"
                                            />
                                        </Tooltip>
                                    </Group>
                                )}
                            />
                        </td>
                        <td>
                            <Group position="right">
                                <Button
                                    px="xs"
                                    variant="outline"
                                    onClick={() => setIsDeleteDialogOpen(true)}
                                    disabled={disabled}
                                    color="red"
                                >
                                    <MantineIcon icon={IconTrash} />
                                </Button>
                            </Group>
                            <Modal
                                opened={isDeleteDialogOpen}
                                onClose={() =>
                                    !isDeleting
                                        ? setIsDeleteDialogOpen(false)
                                        : undefined
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
                            >
                                <Text pb="md">
                                    Are you sure you want to delete this user ?
                                </Text>
                                <Group spacing="xs" position="right">
                                    <Button
                                        disabled={isDeleting}
                                        onClick={() =>
                                            setIsDeleteDialogOpen(false)
                                        }
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
                        </td>
                    </>
                )}
            </tr>

            {inviteLink.data && showInviteSuccess && (
                <tr>
                    <td
                        colSpan={3}
                        style={{ borderTop: 0, padding: '0px 12px 12px' }}
                    >
                        <InviteSuccess
                            invite={inviteLink.data}
                            onClose={() => setShowInviteSuccess(false)}
                        />
                    </td>
                </tr>
            )}
        </>
    );
};

const UserManagementPanel: FC = () => {
    // TODO: this is a feature flag while we are building groups.
    // Remove this when groups are ready to be released.
    const groupManagementEnabled = useFeatureFlagEnabled('group-management');

    const { classes } = useTableStyles();
    const { user } = useApp();
    const [showInviteModal, setShowInviteModal] = useState(false);
    const { data: organizationUsers, isLoading: isLoadingUsers } =
        useOrganizationUsers();

    const { data: groups, isLoading: isLoadingGroups } =
        useOrganizationGroups();

    if (user.data?.ability.cannot('view', 'OrganizationMemberProfile')) {
        return <ForbiddenPanel />;
    }

    return (
        <Stack spacing="sm">
            <Group spacing="two">
                {groupManagementEnabled ? (
                    <Title order={5}>Users and groups</Title>
                ) : (
                    <Title order={5}>User management settings</Title>
                )}
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

            <Tabs defaultValue={'users'}>
                {groupManagementEnabled && (
                    <Tabs.List>
                        <Tabs.Tab value="users">Users</Tabs.Tab>
                        <Tabs.Tab value="groups">Groups</Tabs.Tab>
                    </Tabs.List>
                )}
                <Tabs.Panel value="users">
                    {isLoadingUsers ? (
                        <LoadingState title="Loading users" />
                    ) : (
                        <Stack spacing="xs" mt="xs">
                            {user.data?.ability?.can(
                                'create',
                                'InviteLink',
                            ) && (
                                <Button
                                    compact
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    onClick={() => setShowInviteModal(true)}
                                    sx={{ alignSelf: 'end' }}
                                >
                                    Add user
                                </Button>
                            )}
                            <SettingsCard shadow="none" p={0}>
                                <Table className={classes.root}>
                                    <thead>
                                        <tr>
                                            <th>User</th>
                                            {user.data?.ability?.can(
                                                'manage',
                                                'OrganizationMemberProfile',
                                            ) && (
                                                <>
                                                    <th>Role</th>
                                                    <th></th>
                                                </>
                                            )}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {organizationUsers?.map((orgUser) => (
                                            <UserListItem
                                                key={orgUser.email}
                                                user={orgUser}
                                                disabled={
                                                    user.data?.userUuid ===
                                                        orgUser.userUuid ||
                                                    organizationUsers.length <=
                                                        1
                                                }
                                            />
                                        ))}
                                    </tbody>
                                </Table>
                            </SettingsCard>
                        </Stack>
                    )}
                </Tabs.Panel>
                <Tabs.Panel value="groups">
                    {isLoadingGroups ? (
                        <LoadingState title="Loading groups" />
                    ) : (
                        <Stack spacing="xs" mt="xs">
                            {user.data?.ability?.can(
                                'manage',
                                'Organization',
                            ) && (
                                <Button
                                    compact
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    onClick={() => {
                                        /* TODO: add group dialog */
                                    }}
                                    sx={{ alignSelf: 'end' }}
                                >
                                    Add group
                                </Button>
                            )}
                            <SettingsCard shadow="none" p={0}>
                                <Table className={classes.root}>
                                    <thead>
                                        <tr>
                                            <th>Group</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {groups?.map((group) => (
                                            <tr key={group.name}>
                                                <td>{group.name}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            </SettingsCard>
                        </Stack>
                    )}
                </Tabs.Panel>
            </Tabs>

            <InvitesModal
                key={`invite-modal-${showInviteModal}`}
                opened={showInviteModal}
                onClose={() => setShowInviteModal(false)}
            />
        </Stack>
    );
};

export default UserManagementPanel;
