import { Group as UserGroup } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconPlus, IconTrash } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
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

const GroupListItem: FC<{
    disabled?: boolean;
    group: UserGroup;
    onDelete: (group: UserGroup) => void;
}> = ({ disabled, group, onDelete }) => {
    return (
        <tr>
            <td width={500}>
                <Text fz="xs" fw={400} color="gray.8">
                    {group.name}
                </Text>
            </td>

            <td>
                <Text>No users</Text>
            </td>
            <td>
                <Group position="right">
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
        group?: UserGroup;
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

    const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [groupToDelete, setGroupToDelete] = useState<UserGroup | undefined>(
        undefined,
    );

    const { mutate, isLoading: isDeleting } = useGroupDeleteMutation();

    const { data: groups, isLoading: isLoadingGroups } =
        useOrganizationGroups();

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
        <Stack spacing="xs" mt="xs">
            {user.data?.ability?.can('manage', 'Group') && (
                <Button
                    compact
                    leftIcon={<MantineIcon icon={IconPlus} />}
                    onClick={() => setShowCreateGroupModal(true)}
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
                            <th>Users</th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {groups?.map((group) => (
                            <GroupListItem
                                key={group.uuid}
                                group={group}
                                disabled={user.data?.ability?.cannot(
                                    'manage',
                                    'Group',
                                )}
                                onDelete={(groupForDeletion) => {
                                    setGroupToDelete(groupForDeletion);
                                    setIsDeleteDialogOpen(true);
                                }}
                            />
                        ))}
                    </tbody>
                </Table>
            </SettingsCard>
            <CreateGroupModal
                key={`create-group-modal-${showCreateGroupModal}`}
                opened={showCreateGroupModal}
                onClose={() => setShowCreateGroupModal(false)}
            />
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
