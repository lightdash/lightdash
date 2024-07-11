import {
    getRoleDescription,
    isOrganizationMemberProfileWithGroups,
    OrganizationMemberRole,
    type OrganizationMemberProfile,
    type OrganizationMemberProfileWithGroups,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Button,
    Card,
    Flex,
    Group,
    HoverCard,
    List,
    Modal,
    Pagination,
    Paper,
    Select,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import {
    IconAlertCircle,
    IconHelp,
    IconPlus,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import capitalize from 'lodash/capitalize';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useCreateInviteLinkMutation } from '../../../hooks/useInviteLink';
import {
    useDeleteOrganizationUserMutation,
    usePaginatedOrganizationUsers,
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

const UserNameDisplay: FC<{
    user: OrganizationMemberProfile;
    disabled?: boolean;
    showInviteLink?: boolean;
    hasEmail?: boolean;
    onGetLink?: () => void;
}> = ({ user, showInviteLink, hasEmail, onGetLink }) => {
    return (
        <Flex justify="space-between" align="center">
            {user.isActive ? (
                <Stack spacing="xxs">
                    <Title order={6}>
                        {user.firstName} {user.lastName}
                    </Title>

                    {user.email && (
                        <Badge
                            variant="filled"
                            color="gray.2"
                            radius="xs"
                            sx={{ textTransform: 'none' }}
                            px="xxs"
                        >
                            <Text fz="xs" fw={400} color="gray.8">
                                {user.email}
                            </Text>
                        </Badge>
                    )}
                </Stack>
            ) : (
                <Stack spacing="xxs">
                    {user.email && <Title order={6}>{user.email}</Title>}
                    <Group spacing="xs">
                        <Badge
                            variant="filled"
                            color="orange.3"
                            radius="xs"
                            sx={{ textTransform: 'none' }}
                            px="xxs"
                        >
                            <Text fz="xs" fw={400} color="gray.8">
                                {!user.isInviteExpired
                                    ? 'Pending'
                                    : 'Link expired'}
                            </Text>
                        </Badge>
                        {showInviteLink && (
                            <Anchor
                                component="button"
                                onClick={onGetLink}
                                size="xs"
                                fw={500}
                            >
                                {hasEmail ? 'Send new invite' : 'Get new link'}
                            </Anchor>
                        )}
                    </Group>
                </Stack>
            )}
        </Flex>
    );
};

const UserListItem: FC<{
    disabled: boolean;
    user: OrganizationMemberProfile | OrganizationMemberProfileWithGroups;
    isGroupManagementEnabled?: boolean;
}> = ({ disabled, user, isGroupManagementEnabled }) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [showInviteSuccess, setShowInviteSuccess] = useState(true);
    const { mutate, isLoading: isDeleting } =
        useDeleteOrganizationUserMutation();
    const inviteLink = useCreateInviteLinkMutation();
    const { track } = useTracking();
    const { user: activeUser, health } = useApp();
    const updateUser = useUpdateUserMutation(user.userUuid);
    const handleDelete = () => mutate(user.userUuid);

    const getNewLink = () => {
        track({
            name: EventName.INVITE_BUTTON_CLICKED,
        });
        inviteLink.mutate({ email: user.email, role: user.role });
        setShowInviteSuccess(true);
    };

    return (
        <>
            <tr>
                <td width={300}>
                    <UserNameDisplay
                        disabled={disabled}
                        user={user}
                        showInviteLink={activeUser.data?.ability?.can(
                            'create',
                            'InviteLink',
                        )}
                        onGetLink={getNewLink}
                        hasEmail={health.data?.hasEmailClient}
                    />
                </td>
                {activeUser.data?.ability?.can(
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
                                value={user.role}
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
                        {isGroupManagementEnabled && (
                            <td>
                                {isOrganizationMemberProfileWithGroups(
                                    user,
                                ) && (
                                    <HoverCard
                                        shadow="sm"
                                        disabled={user.groups.length < 1}
                                    >
                                        <HoverCard.Target>
                                            <Text color="gray">{`${
                                                user.groups.length
                                            } group${
                                                user.groups.length !== 1
                                                    ? 's'
                                                    : ''
                                            }`}</Text>
                                        </HoverCard.Target>
                                        <HoverCard.Dropdown p="sm">
                                            <Text
                                                fz="xs"
                                                fw={600}
                                                color="gray.6"
                                            >
                                                User groups:
                                            </Text>
                                            <List
                                                size="xs"
                                                ml="xs"
                                                mt="xs"
                                                fz="xs"
                                            >
                                                {user.groups.map((group) => (
                                                    <List.Item key={group.name}>
                                                        {group.name}
                                                    </List.Item>
                                                ))}
                                            </List>
                                        </HoverCard.Dropdown>
                                    </HoverCard>
                                )}
                            </td>
                        )}
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
                                    Are you sure you want to delete this user?
                                </Text>
                                <Card withBorder>
                                    <UserNameDisplay user={user} />
                                </Card>
                                <Group spacing="xs" position="right" mt="md">
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

const DEFAULT_PAGE_SIZE = 10;

const UsersView: FC = () => {
    const [showInviteModal, setShowInviteModal] = useState(false);
    const { user, health } = useApp();
    const { classes } = useTableStyles();
    const [page, setPage] = useState(1);

    const [search, setSearch] = useState('');
    const [debouncedSearchQuery] = useDebouncedValue(search, 500);

    // TODO: fix the hardcoded groups number. This should be paginated.
    const { data: paginatedUsers, isInitialLoading: isLoadingUsers } =
        usePaginatedOrganizationUsers({
            searchInput: debouncedSearchQuery,
            includeGroups: 10000,
            paginateArgs: {
                page,
                pageSize: DEFAULT_PAGE_SIZE,
            },
        });

    useEffect(() => {
        setPage(1);
    }, [debouncedSearchQuery]);

    const organizationUsers = useMemo(() => {
        return paginatedUsers?.data;
    }, [paginatedUsers]);

    const pagination = useMemo(() => {
        return paginatedUsers?.pagination;
    }, [paginatedUsers]);

    if (!user.data || !health.data) return null;

    const isGroupManagementEnabled = health.data.hasGroups;

    if (isLoadingUsers) {
        return <LoadingState title="Loading users" />;
    }

    return (
        <Stack spacing="xs">
            <SettingsCard shadow="none" p={0}>
                <Paper p="sm" radius={0}>
                    <Group align="center" position="apart">
                        <TextInput
                            size="xs"
                            placeholder="Search users by name, email, or role"
                            onChange={(e) => setSearch(e.target.value)}
                            value={search}
                            w={320}
                            rightSection={
                                search.length > 0 && (
                                    <ActionIcon onClick={() => setSearch('')}>
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                        />
                        {user.data?.ability?.can('create', 'InviteLink') && (
                            <Button
                                compact
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setShowInviteModal(true)}
                            >
                                Add user
                            </Button>
                        )}
                    </Group>
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
                                    {isGroupManagementEnabled && (
                                        <th>Groups</th>
                                    )}
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
                                    isGroupManagementEnabled={
                                        isGroupManagementEnabled
                                    }
                                    disabled={
                                        user.data?.userUuid ===
                                            orgUser.userUuid ||
                                        organizationUsers.length < 1
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
                {pagination?.totalPageCount && pagination.totalPageCount > 1 ? (
                    <Flex m="sm" align="center" justify="center">
                        <Pagination
                            size="sm"
                            value={page}
                            onChange={setPage}
                            total={pagination?.totalPageCount}
                            mt="sm"
                        />
                    </Flex>
                ) : null}
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
