import {
    getRoleDescription,
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
    Button,
    Flex,
    Group,
    Modal,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconHelp,
    IconPlus,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { FC, useState } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
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
import InvitesModal from './InvitesModal';
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

const UsersView: FC = () => {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const { user } = useApp();
    const { classes } = useTableStyles();

    const [search, setSearch] = useState('');

    const { data: organizationUsers, isLoading: isLoadingUsers } =
        useOrganizationUsers(search);

    if (isLoadingUsers) {
        return <LoadingState title="Loading users" />;
    }

    return (
        <Stack spacing="xs">
            {user.data?.ability?.can('create', 'InviteLink') && (
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
                <Paper p="sm">
                    <TextInput
                        size="xs"
                        placeholder="Search users by name, email, or role"
                        onChange={(e) => setSearch(e.target.value)}
                        value={search}
                        w={320}
                        rightSection={
                            search.length > 0 && (
                                <MantineIcon
                                    color="gray.6"
                                    icon={IconX}
                                    onClick={() => setSearch('')}
                                    style={{ cursor: 'pointer' }}
                                />
                            )
                        }
                    />
                </Paper>
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
                        {organizationUsers && organizationUsers.length ? (
                            organizationUsers.map((orgUser) => (
                                <UserListItem
                                    key={orgUser.email}
                                    user={orgUser}
                                    disabled={
                                        user.data?.userUuid ===
                                            orgUser.userUuid ||
                                        organizationUsers.length <= 1
                                    }
                                />
                            ))
                        ) : (
                            <tr>
                                <td colSpan={3}>
                                    <Text c="gray.6" fs="italic" ta="center">
                                        No users found
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </SettingsCard>
            <InvitesModal
                key={`invite-modal-${showInviteModal}`}
                opened={showInviteModal}
                onClose={() => setShowInviteModal(false)}
            />
        </Stack>
    );
};

export default UsersView;
