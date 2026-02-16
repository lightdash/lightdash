import { subject } from '@casl/ability';
import { Menu } from '@mantine-8/core';
import { ActionIcon, Box } from '@mantine/core';
import {
    IconEdit,
    IconFolderSymlink,
    IconPin,
    IconPinned,
    IconTrash,
} from '@tabler/icons-react';
import React from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    isPinned: boolean;
    onRename: () => void;
    onDelete: () => void;
    onTogglePin: () => void;
    onTransferToSpace: () => void;
}

export const SpaceBrowserMenu: React.FC<React.PropsWithChildren<Props>> = ({
    isPinned,
    onRename,
    onDelete,
    onTogglePin,
    onTransferToSpace,
    children,
}) => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const projectUuid = useProjectUuid();

    return (
        <Menu
            withinPortal
            position="bottom-end"
            withArrow
            arrowPosition="center"
            shadow="md"
            closeOnItemClick
            closeOnClickOutside
        >
            <Menu.Target>
                <Box>
                    <ActionIcon>{children}</ActionIcon>
                </Box>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    component="button"
                    role="menuitem"
                    leftSection={<MantineIcon icon={IconEdit} />}
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
                        leftSection={
                            isPinned ? (
                                <MantineIcon icon={IconPinned} />
                            ) : (
                                <MantineIcon icon={IconPin} />
                            )
                        }
                        onClick={onTogglePin}
                    >
                        {isPinned ? 'Unpin from homepage' : 'Pin to homepage'}
                    </Menu.Item>
                )}

                <Menu.Divider />

                <Menu.Item
                    component="button"
                    role="menuitem"
                    leftSection={<IconFolderSymlink size={18} />}
                    onClick={() => {
                        onTransferToSpace();
                    }}
                >
                    Move
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                    component="button"
                    role="menuitem"
                    color="red"
                    leftSection={<MantineIcon icon={IconTrash} />}
                    onClick={onDelete}
                >
                    Delete space
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};
