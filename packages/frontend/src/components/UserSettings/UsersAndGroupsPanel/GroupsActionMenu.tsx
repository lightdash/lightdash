import { type GroupWithMembers } from '@lightdash/common';
import { ActionIcon, Menu } from '@mantine/core';
import { IconDots, IconEdit, IconTrash } from '@tabler/icons-react';
import React, { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation('userSettings');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = React.useState(false);
    const { mutateAsync, isLoading: isDeleting } = useGroupDeleteMutation();

    const handleDelete = async () => {
        await mutateAsync(group);
        setIsDeleteDialogOpen(false);
    };

    return (
        <>
            <Menu
                position="bottom-start"
                withArrow
                arrowPosition="center"
                offset={-4}
                closeOnItemClick
                closeOnClickOutside
            >
                <Menu.Target>
                    <ActionIcon disabled={disabled}>
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
                        {t('usersAndGroupsPanel.groupsActionMenu.editGroup')}
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
                        {t('usersAndGroupsPanel.groupsActionMenu.deleteGroup')}
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>

            <MantineModal
                opened={isDeleteDialogOpen}
                onClose={() =>
                    !isDeleting ? setIsDeleteDialogOpen(false) : undefined
                }
                title={t('usersAndGroupsPanel.groupsActionMenu.deleteGroup')}
                variant="delete"
                resourceType={t(
                    'usersAndGroupsPanel.groupsActionMenu.resourceType',
                )}
                resourceLabel={group.name}
                cancelDisabled={isDeleting}
                onConfirm={handleDelete}
                confirmLoading={isDeleting}
            />
        </>
    );
};

export default GroupsActionMenu;
