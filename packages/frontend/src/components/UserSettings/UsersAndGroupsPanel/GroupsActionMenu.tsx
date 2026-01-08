import { type GroupWithMembers } from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine-8/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useGroupDeleteMutation } from '../../../hooks/useOrganizationGroups';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

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

            <MantineModal
                opened={isDeleteDialogOpen}
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title="Delete group"
                variant="delete"
                resourceType="group"
                resourceLabel={group.name}
                cancelDisabled={isDeleting}
                onConfirm={handleDelete}
                confirmLoading={isDeleting}
            />
        </>
    );
};

export default GroupsActionMenu;
