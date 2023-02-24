import { subject } from '@casl/ability';
import { assertUnreachable, Space } from '@lightdash/common';
import { ActionIcon, Box, Menu, Text } from '@mantine/core';
import {
    IconCheck,
    IconCopy,
    IconDots,
    IconEdit,
    IconPin,
    IconPinned,
    IconPlus,
    IconSquarePlus,
    IconTrash,
} from '@tabler/icons-react';
import { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';
import {
    ResourceViewItemAction,
    ResourceViewItemActionState,
} from './ResourceActionHandlers';
import { ResourceViewItem, ResourceViewItemType } from './resourceTypeUtils';

type Props = {
    item: ResourceViewItem;
    spaces: Space[];
    url: string;
    onAction: (newAction: ResourceViewItemActionState) => void;
};

const ResourceViewItemActionMenu: FC<Props> = ({
    item,
    spaces,
    url,
    onAction,
}) => {
    const { user } = useApp();
    const isPinned = !!item.data.pinnedListUuid;
    const isDashboardPage = url.includes('/dashboards');
    const organizationUuid = user.data?.organizationUuid;
    const { projectUuid } = useParams<{ projectUuid: string }>();

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
        <Menu shadow="md" position="bottom-end">
            <Menu.Target>
                <ActionIcon>
                    <IconDots size={16} />
                </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown maw={320}>
                <Menu.Item
                    icon={<IconEdit size={18} />}
                    onClickCapture={() => {
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
                        icon={<IconCopy size={18} />}
                        onClickCapture={() => {
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
                        icon={<IconSquarePlus size={18} />}
                        role="menuitem"
                        onClickCapture={() => {
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
                ) &&
                (item.type === ResourceViewItemType.CHART ||
                    item.type === ResourceViewItemType.DASHBOARD ||
                    (item.type === ResourceViewItemType.SPACE &&
                        localStorage.getItem('feat-pin-space'))) ? (
                    <Menu.Item
                        icon={
                            isPinned ? (
                                <IconPinned size={18} />
                            ) : (
                                <IconPin size={18} />
                            )
                        }
                        onClickCapture={() => {
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

                        <Menu.Label>Move to Space</Menu.Label>

                        {spaces.map((space) => {
                            const isSelected =
                                item.data.spaceUuid === space.uuid;
                            return (
                                <Menu.Item
                                    key={space.uuid}
                                    disabled={isSelected}
                                    icon={
                                        isSelected ? (
                                            <IconCheck size={18} />
                                        ) : (
                                            <Box w={18} h={18} />
                                        )
                                    }
                                    onClickCapture={() => {
                                        if (!isSelected) {
                                            onAction({
                                                type: ResourceViewItemAction.MOVE_TO_SPACE,
                                                item,
                                                data: {
                                                    ...item.data,
                                                    spaceUuid: space.uuid,
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
                            icon={<IconPlus size={18} />}
                            onClickCapture={() => {
                                onAction({
                                    type: ResourceViewItemAction.CREATE_SPACE,
                                    item,
                                });
                            }}
                        >
                            Create new space
                        </Menu.Item>
                    </>
                ) : null}

                <Menu.Divider />

                <Menu.Item
                    color="red"
                    icon={<IconTrash size={18} />}
                    onClickCapture={() => {
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
