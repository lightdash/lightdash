import { type GroupWithMembers } from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Button,
    Group,
    Modal,
    Paper,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import {
    IconAlertCircle,
    IconEdit,
    IconPlus,
    IconTrash,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useState, type FC } from 'react';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import {
    useGroupDeleteMutation,
    useOrganizationGroups,
} from '../../../hooks/useOrganizationGroups';
import { useApp } from '../../../providers/AppProvider';
import LoadingState from '../../common/LoadingState';
import MantineIcon from '../../common/MantineIcon';
import { SettingsCard } from '../../common/Settings/SettingsCard';
import CreateGroupModal from './CreateGroupModal';

const GROUP_MEMBERS_PER_PAGE = 2000;

const GroupListItem: FC<{
    disabled?: boolean;
    group: GroupWithMembers;
    onDelete: (group: GroupWithMembers) => void;
    onEdit: (group: GroupWithMembers) => void;
}> = ({ disabled, group, onDelete, onEdit }) => {
    return (
        <tr>
            <td width={260}>
                <Stack spacing="xxs">
                    <Title order={6}>{group.name}</Title>
                    {group.members.length > 0 && (
                        <Text color="gray">{`${group.members.length} members`}</Text>
                    )}
                </Stack>
            </td>

            <td>
                {group?.members.length > 0 ? (
                    <Group
                        spacing="xxs"
                        maw={400}
                        mah={55}
                        sx={(theme) => ({
                            overflow: 'auto',
                            border: `1px solid ${theme.colors.gray[2]}`,
                            borderRadius: theme.radius.xs,
                            padding: theme.spacing.xxs,
                        })}
                    >
                        {group.members.map((member) => (
                            <Badge
                                key={member.userUuid}
                                variant="filled"
                                color="gray.2"
                                radius="xs"
                                sx={{ textTransform: 'none' }}
                                px="xxs"
                            >
                                <Text fz="xs" fw={400} color="gray.8">
                                    {member.email}
                                </Text>
                            </Badge>
                        ))}
                    </Group>
                ) : (
                    <Text color="gray" fs="italic">
                        No members
                    </Text>
                )}
            </td>
            <td>
                <Group position="right">
                    <Button
                        px="xs"
                        variant="outline"
                        onClick={() => onEdit(group)}
                        disabled={disabled}
                    >
                        <MantineIcon icon={IconEdit} />
                    </Button>
                    <Button
                        px="xs"
                        variant="outline"
                        onClick={() => onDelete(group)}
                        disabled={disabled}
                        color="red"
                    >
                        <MantineIcon icon={IconTrash} />
                    </Button>
                </Group>
            </td>
        </tr>
    );
};

const DeleteGroupModal: FC<
    ModalProps & {
        group?: GroupWithMembers;
        disableControls?: boolean;
        onAcceptDelete: () => void;
    }
> = ({ opened, group, disableControls, onAcceptDelete, onClose }) => {
    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconAlertCircle} color="red" />
                    <Title order={4}>Delete group {group?.name}</Title>
                </Group>
            }
        >
            <Text pb="md">Are you sure you want to delete this group?</Text>
            <Group spacing="xs" position="right">
                <Button
                    disabled={disableControls}
                    onClick={onClose}
                    variant="outline"
                    color="dark"
                >
                    Cancel
                </Button>
                <Button
                    disabled={disableControls}
                    onClick={onAcceptDelete}
                    color="red"
                >
                    Delete
                </Button>
            </Group>
        </Modal>
    );
};

const GroupsView: FC = () => {
    const { classes } = useTableStyles();
    const { user } = useApp();

    const [showCreateAndEditModal, setShowCreateAndEditModal] = useState(false);

    const [groupToEdit, setGroupToEdit] = useState<
        GroupWithMembers | undefined
    >(undefined);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<
        GroupWithMembers | undefined
    >(undefined);

    const { mutate, isLoading: isDeleting } = useGroupDeleteMutation();

    const [search, setSearch] = useState('');

    const { data: groups, isInitialLoading: isLoadingGroups } =
        useOrganizationGroups({
            search,
            includeMembers: GROUP_MEMBERS_PER_PAGE, // TODO: pagination
        });

    const handleDelete = useCallback(() => {
        if (groupToDelete) {
            mutate(groupToDelete);
            setIsDeleteDialogOpen(false);
        }
    }, [groupToDelete, mutate]);

    if (isLoadingGroups) {
        <LoadingState title="Loading groups" />;
    }

    return (
        <Stack spacing="xs">
            <SettingsCard shadow="none" p={0}>
                <Paper p="sm" radius={0}>
                    <Group align="center" position="apart">
                        <TextInput
                            size="xs"
                            placeholder="Search groups by name, members or member email "
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
                        {user.data?.ability?.can('manage', 'Group') && (
                            <Button
                                compact
                                leftIcon={<MantineIcon icon={IconPlus} />}
                                onClick={() => setShowCreateAndEditModal(true)}
                            >
                                Add group
                            </Button>
                        )}
                    </Group>
                </Paper>
                <Table className={classes.root}>
                    <thead>
                        <tr>
                            <th>Group</th>
                            <th>Members</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {groups && groups.length ? (
                            groups?.map((group) => (
                                <GroupListItem
                                    key={group.uuid}
                                    group={group}
                                    disabled={user.data?.ability?.cannot(
                                        'manage',
                                        'Group',
                                    )}
                                    onEdit={(g) => {
                                        setGroupToEdit(g);
                                        setShowCreateAndEditModal(true);
                                    }}
                                    onDelete={(groupForDeletion) => {
                                        setGroupToDelete(groupForDeletion);
                                        setIsDeleteDialogOpen(true);
                                    }}
                                />
                            ))
                        ) : (
                            <tr>
                                <td colSpan={3}>
                                    <Text c="gray.6" fs="italic" ta="center">
                                        No groups found
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>
            </SettingsCard>
            {showCreateAndEditModal && (
                <CreateGroupModal
                    key={`create-group-modal-${showCreateAndEditModal}`}
                    opened={showCreateAndEditModal}
                    onClose={() => {
                        setShowCreateAndEditModal(false);
                        setGroupToEdit(undefined);
                    }}
                    groupToEdit={groupToEdit}
                    isEditing={groupToEdit !== undefined}
                />
            )}
            <DeleteGroupModal
                key={`delete-group-modal-${isDeleteDialogOpen}`}
                opened={isDeleteDialogOpen}
                onClose={() => setIsDeleteDialogOpen(false)}
                group={groupToDelete}
                onAcceptDelete={handleDelete}
                disableControls={isDeleting}
            />
        </Stack>
    );
};

export default GroupsView;
