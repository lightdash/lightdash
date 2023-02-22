import { Divider, Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { assertUnreachable, Space } from '@lightdash/common';
import { ActionIcon } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
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
        <Popover2
            lazy
            position={Position.BOTTOM_RIGHT}
            content={
                <Menu>
                    <MenuItem2
                        role="menuitem"
                        icon="edit"
                        text="Rename"
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.UPDATE,
                                item,
                            });
                        }}
                    />

                    {item.type === ResourceViewItemType.CHART ||
                    item.type === ResourceViewItemType.DASHBOARD ? (
                        <MenuItem2
                            role="menuitem"
                            icon="duplicate"
                            text="Duplicate"
                            onClick={() => {
                                onAction({
                                    type: ResourceViewItemAction.DUPLICATE,
                                    item,
                                });
                            }}
                        />
                    ) : null}

                    {user.data?.ability.can(
                        'update',
                        subject('Project', { organizationUuid, projectUuid }),
                    ) &&
                    (item.type === ResourceViewItemType.CHART ||
                        item.type === ResourceViewItemType.DASHBOARD ||
                        (item.type === ResourceViewItemType.SPACE &&
                            localStorage.getItem('feat-pin-space'))) ? (
                        <MenuItem2
                            role="menuitem"
                            icon="pin"
                            text={
                                isPinned
                                    ? 'Unpin from homepage'
                                    : 'Pin to homepage'
                            }
                            onClick={() => {
                                onAction({
                                    type: ResourceViewItemAction.PIN_TO_HOMEPAGE,
                                    item,
                                });
                            }}
                        />
                    ) : null}

                    {!isDashboardPage &&
                        item.type === ResourceViewItemType.CHART && (
                            <MenuItem2
                                icon="insert"
                                text="Add to Dashboard"
                                role="menuitem"
                                onClick={() => {
                                    onAction({
                                        type: ResourceViewItemAction.ADD_TO_DASHBOARD,
                                        item,
                                    });
                                }}
                            />
                        )}

                    {item.type === ResourceViewItemType.CHART ||
                    item.type === ResourceViewItemType.DASHBOARD ? (
                        <MenuItem2
                            tagName="div"
                            icon="folder-close"
                            text="Move to Space"
                        >
                            {spaces.map((space) => {
                                const isSelected =
                                    item.data.spaceUuid === space.uuid;
                                return (
                                    <MenuItem2
                                        key={space.uuid}
                                        roleStructure="listoption"
                                        text={space.name}
                                        selected={isSelected}
                                        className={
                                            isSelected ? 'bp4-disabled' : ''
                                        }
                                        onClick={() => {
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
                                    />
                                );
                            })}

                            <Divider />

                            <MenuItem2
                                icon="plus"
                                text="Create new"
                                onClick={() => {
                                    onAction({
                                        type: ResourceViewItemAction.CREATE_SPACE,
                                        item,
                                    });
                                }}
                            />
                        </MenuItem2>
                    ) : null}

                    <Divider />

                    <MenuItem2
                        role="menuitem"
                        icon="cross"
                        text="Delete"
                        intent="danger"
                        onClick={() => {
                            onAction({
                                type: ResourceViewItemAction.DELETE,
                                item,
                            });
                        }}
                    />
                </Menu>
            }
        >
            <ActionIcon>
                <IconDots size={17} />
            </ActionIcon>
        </Popover2>
    );
};

export default ResourceViewItemActionMenu;
