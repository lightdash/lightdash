import { subject } from '@casl/ability';
import { assertUnreachable } from '@lightdash/common';
import { ActionIcon, Box, Menu } from '@mantine/core';
import {
    IconCheck,
    IconChevronRight,
    IconCopy,
    IconDots,
    IconEdit,
    IconFolders,
    IconPin,
    IconPinned,
    IconPlus,
    IconSquarePlus,
    IconTrash,
} from '@tabler/icons-react';
import { FC } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import {
    ResourceViewItemAction,
    ResourceViewItemActionState,
} from './ResourceActionHandlers';
import { ResourceViewItem, ResourceViewItemType } from './resourceTypeUtils';

export interface ResourceViewItemActionMenuCommonProps {
    onAction: (newAction: ResourceViewItemActionState) => void;
}

interface ResourceViewItemActionMenuProps
    extends ResourceViewItemActionMenuCommonProps {
    item: ResourceViewItem;
    isOpen: boolean;
    onToggle: () => void;
}

const ResourceViewItemActionMenu: FC<ResourceViewItemActionMenuProps> = ({
    item,
    isOpen,
    onToggle,
    onAction,
}) => {
    const { user } = useApp();
    const location = useLocation();
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const organizationUuid = user.data?.organizationUuid;
    const { data: spaces = [] } = useSpaces(projectUuid);
    const isPinned = !!item.data.pinnedListUuid;
    const isDashboardPage = location.pathname.includes('/dashboards');

    switch (item.type) {
        case ResourceViewItemType.CHART:
            if (user.data?.ability?.cannot('manage', 'SavedChart')) {
                return null;
            }
            break;
        case ResourceViewItemType.DASHBOARD:
            if (user.data?.ability?.cannot('manage', 'Dashboard')) {
                return null;
            }
            break;
        case ResourceViewItemType.SPACE:
            if (user.data?.ability?.cannot('manage', 'Space')) {
                return null;
            }
            break;
        default:
            return assertUnreachable(item, 'Resource type not supported');
    }

    return (
        <Menu
            opened={isOpen}
            shadow="md"
            position="bottom-start"
            withArrow
            withinPortal
            onClose={() => onToggle()}
            arrowOffset={9}
            offset={-4}
        >
            <Menu.Target>
                <Box onClick={onToggle}>
                    <ActionIcon
                        sx={(theme) => ({
                            ':hover': {
                                backgroundColor: theme.colors.gray[1],
                            },
                        })}
                    >
                        <IconDots size={16} />
                    </ActionIcon>
                </Box>
            </Menu.Target>

            <Menu.Dropdown maw={320}>
                <Menu.Item
                    component="button"
                    role="menuitem"
                    icon={<IconEdit size={18} />}
                    onClick={() => {
                        onAction({
                            type: ResourceViewItemAction.UPDATE,
                            item,
                        });
                    }}
                >
                    Rename
                </Menu.Item>

                {item.type === ResourceViewItemType.CHART ||
                item.type === ResourceViewItemType.DASHBOARD ? (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={<IconCopy size={18} />}
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.DUPLICATE,
                                item,
                            });
                        }}
                    >
                        Duplicate
                    </Menu.Item>
                ) : null}

                {!isDashboardPage && item.type === ResourceViewItemType.CHART && (
                    <Menu.Item
                        component="button"
                        role="menuitem"
                        icon={<IconSquarePlus size={18} />}
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.ADD_TO_DASHBOARD,
                                item,
                            });
                        }}
                    >
                        Add to Dashboard
                    </Menu.Item>
                )}

                {user.data?.ability.can(
                    'update',
                    subject('Project', { organizationUuid, projectUuid }),
                ) ? (
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
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.PIN_TO_HOMEPAGE,
                                item,
                            });
                        }}
                    >
                        {isPinned ? 'Unpin from homepage' : 'Pin to homepage'}
                    </Menu.Item>
                ) : null}

                {item.type === ResourceViewItemType.CHART ||
                item.type === ResourceViewItemType.DASHBOARD ? (
                    <>
                        <Menu.Divider />

                        <Menu
                            shadow="md"
                            position="right-start"
                            trigger="hover"
                            offset={0}
                        >
                            <Menu.Target>
                                <Menu.Item
                                    component="button"
                                    role="menuitem"
                                    icon={<IconFolders size={18} />}
                                    rightSection={
                                        <Box w={18} h={18}>
                                            <IconChevronRight size={18} />
                                        </Box>
                                    }
                                >
                                    Move to Space
                                </Menu.Item>
                            </Menu.Target>

                            <Menu.Dropdown maw={320}>
                                {spaces.map((space) => {
                                    const isSelected =
                                        item.data.spaceUuid === space.uuid;
                                    return (
                                        <Menu.Item
                                            component="button"
                                            role="menuitem"
                                            key={space.uuid}
                                            disabled={isSelected}
                                            icon={
                                                isSelected ? (
                                                    <IconCheck size={18} />
                                                ) : (
                                                    <Box w={18} h={18} />
                                                )
                                            }
                                            onClick={() => {
                                                if (!isSelected) {
                                                    onAction({
                                                        type: ResourceViewItemAction.MOVE_TO_SPACE,
                                                        item,
                                                        data: {
                                                            ...item.data,
                                                            spaceUuid:
                                                                space.uuid,
                                                        },
                                                    });
                                                }
                                            }}
                                        >
                                            {space.name}
                                        </Menu.Item>
                                    );
                                })}

                                <Menu.Item
                                    component="button"
                                    role="menuitem"
                                    icon={<IconPlus size={18} />}
                                    onClick={() => {
                                        onAction({
                                            type: ResourceViewItemAction.CREATE_SPACE,
                                            item,
                                        });
                                    }}
                                >
                                    Create new space
                                </Menu.Item>
                            </Menu.Dropdown>
                        </Menu>
                    </>
                ) : null}

                <Menu.Divider />

                <Menu.Item
                    component="button"
                    role="menuitem"
                    color="red"
                    icon={<IconTrash size={18} />}
                    onClick={() => {
                        onAction({
                            type: ResourceViewItemAction.DELETE,
                            item,
                        });
                    }}
                >
                    Delete
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default ResourceViewItemActionMenu;
