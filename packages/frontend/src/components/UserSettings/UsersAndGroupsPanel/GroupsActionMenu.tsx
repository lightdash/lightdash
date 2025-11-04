import { type GroupWithMembers } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Menu,
    Modal,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconDots,
    IconEdit,
    IconTrash,
} from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useGroupDeleteMutation } from '../../../hooks/useOrganizationGroups';
import MantineIcon from '../../common/MantineIcon';

interface GroupsActionMenuProps {
    group: GroupWithMembers;
    disabled: boolean;
    onEdit: (group: GroupWithMembers) => void;
}

const GroupsActionMenu: FC<GroupsActionMenuProps> = ({
    group,
    disabled,
    onEdit,
}) => {
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const { mutateAsync, isLoading: isDeleting } = useGroupDeleteMutation();

    const handleDelete = async () => {
        await mutateAsync(group);
        setIsDeleteDialogOpen(false);
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
                    <ActionIcon variant="subtle" disabled={disabled}>
                        <MantineIcon icon={IconDots} />
                    </ActionIcon>
                </Menu.Target>

                <Menu.Dropdown maw={320}>
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        leftSection={<MantineIcon icon={IconEdit} />}
                        onClick={() => onEdit(group)}
                        disabled={disabled}
                    >
                        Edit group
                    </Menu.Item>
                    <Menu.Divider />
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        color="red"
                        leftSection={<MantineIcon icon={IconTrash} />}
                        onClick={() => setIsDeleteDialogOpen(true)}
                        disabled={disabled}
                    >
                        Delete group
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
                        <MantineIcon
                            size="lg"
                            icon={IconAlertCircle}
                            color="red"
                        />
                        <Title order={4}>Delete group "{group.name}"</Title>
                    </Group>
                }
            >
                <Stack gap="xs">
                    <Text>Are you sure you want to delete this group?</Text>
                    <Group gap="xs" justify="right">
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

export default GroupsActionMenu;
