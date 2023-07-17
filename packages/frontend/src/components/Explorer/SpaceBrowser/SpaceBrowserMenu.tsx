import { subject } from '@casl/ability';
import { ActionIcon, Box, Menu } from '@mantine/core';
import { IconEdit, IconPin, IconPinned, IconTrash } from '@tabler/icons-react';
import React from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';

interface Props {
    isPinned: boolean;
    onRename: () => void;
    onDelete: () => void;
    onTogglePin: () => void;
}

export const SpaceBrowserMenu: React.FC<Props> = ({
    isPinned,
    onRename,
    onDelete,
    onTogglePin,
    children,
}) => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const { projectUuid } = useParams<{ projectUuid: string }>();

    return (
        <Menu position="bottom-start">
            <Menu.Target>
                <Box>
                    <ActionIcon>{children}</ActionIcon>
                </Box>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    component="button"
                    role="menuitem"
                    icon={<IconEdit size={18} />}
                    onClick={onRename}
                >
                    Rename
                </Menu.Item>

                {user.data?.ability.can(
                    'manage',
                    subject('PinnedItems', {
                        organizationUuid,
                        projectUuid,
                    }),
                ) && (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={
                            isPinned ? (
                                <IconPinned size={18} />
                            ) : (
                                <IconPin size={18} />
                            )
                        }
                        onClick={onTogglePin}
                    >
                        {isPinned ? 'Unpin from homepage' : 'Pin to homepage'}
                    </Menu.Item>
                )}

                <Menu.Item
                    component="button"
                    role="menuitem"
                    color="red"
                    icon={<IconTrash size={18} />}
                    onClick={onDelete}
                >
                    Delete space
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
