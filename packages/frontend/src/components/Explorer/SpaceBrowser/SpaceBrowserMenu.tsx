import { subject } from '@casl/ability';
import { ContentType } from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { ActionIcon, Box } from '@mantine/core';
import {
    IconEdit,
    IconFolderSymlink,
    IconPin,
    IconPinned,
    IconStar,
    IconStarFilled,
    IconTrash,
    IconUsers,
} from '@tabler/icons-react';
import React from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import useApp from '../../../providers/App/useApp';
import useFavoritesContext from '../../../providers/Favorites/useFavoritesContext';
import MantineIcon from '../../common/MantineIcon';

interface Props {
    isPinned: boolean;
    spaceUuid: string;
    onRename: () => void;
    onDelete: () => void;
    onTogglePin: () => void;
    onTransferToSpace: () => void;
    onShare: () => void;
}

export const SpaceBrowserMenu: React.FC<React.PropsWithChildren<Props>> = ({
    isPinned,
    spaceUuid,
    onRename,
    onDelete,
    onTogglePin,
    onTransferToSpace,
    onShare,
    children,
}) => {
    const { user } = useApp();
    const organizationUuid = user.data?.organizationUuid;
    const projectUuid = useProjectUuid();
    const favoritesContext = useFavoritesContext();
    const isFavorited = favoritesContext?.isFavorited(spaceUuid) ?? false;

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
                {favoritesContext && (
                    <>
                        <Menu.Item
                            component="button"
                            role="menuitem"
                            leftSection={
                                isFavorited ? (
                                    <MantineIcon icon={IconStarFilled} />
                                ) : (
                                    <MantineIcon icon={IconStar} />
                                )
                            }
                            onClick={() =>
                                favoritesContext.toggleFavorite(
                                    ContentType.SPACE,
                                    spaceUuid,
                                )
                            }
                        >
                            {isFavorited
                                ? 'Remove from favorites'
                                : 'Add to favorites'}
                        </Menu.Item>

                        <Menu.Divider />
                    </>
                )}

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

                <Menu.Item
                    component="button"
                    role="menuitem"
                    leftSection={<IconUsers size={18} />}
                    onClick={onShare}
                >
                    Share
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
