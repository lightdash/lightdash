import { Button, Divider, Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { subject } from '@casl/ability';
import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useApp } from '../../../providers/AppProvider';
import {
    ResourceListAction,
    ResourceListActionState,
} from './ResourceActionHandlers';
import { ResourceListItem, ResourceListType } from './ResourceTypeUtils';

type Props = {
    item: ResourceListItem;
    spaces: Space[];
    url: string;
    onAction: (newAction: ResourceListActionState) => void;
};

const ResourceListActionMenu: FC<Props> = ({ item, spaces, url, onAction }) => {
    const [isOpen, setIsOpen] = useState(false);

    const { user } = useApp();
    const isPinned = !!item.data.pinnedListUuid;
    const isDashboardPage = url.includes('/dashboards');
    const organizationUuid = user.data?.organizationUuid;
    const { projectUuid } = useParams<{ projectUuid: string }>();

    switch (item.type) {
        case ResourceListType.CHART:
            if (user.data?.ability?.cannot('manage', 'SavedChart')) {
                return null;
            }
            break;
        case ResourceListType.DASHBOARD:
            if (user.data?.ability?.cannot('manage', 'Dashboard')) {
                return null;
            }
            break;
        case ResourceListType.SPACE:
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
            isOpen={isOpen}
            position={Position.BOTTOM_RIGHT}
            onClose={() => {
                setIsOpen(false);
            }}
            content={
                <Menu>
                    <MenuItem2
                        role="menuitem"
                        icon="edit"
                        text="Rename"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            setIsOpen(false);
                            onAction({ type: ResourceListAction.UPDATE, item });
                        }}
                    />

                    {item.type === ResourceListType.CHART ||
                        (item.type === ResourceListType.DASHBOARD && (
                            <MenuItem2
                                role="menuitem"
                                icon="duplicate"
                                text="Duplicate"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    setIsOpen(false);
                                    onAction({
                                        type: ResourceListAction.DUPLICATE,
                                        item,
                                    });
                                }}
                            />
                        ))}

                    {user.data?.ability.can(
                        'update',
                        subject('Project', { organizationUuid, projectUuid }),
                    ) && (
                        <MenuItem2
                            role="menuitem"
                            icon="pin"
                            text={
                                isPinned
                                    ? 'Unpin from homepage'
                                    : 'Pin to homepage'
                            }
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                setIsOpen(false);
                                onAction({
                                    type: ResourceListAction.PIN_TO_HOMEPAGE,
                                    item,
                                });
                            }}
                        />
                    )}

                    {!isDashboardPage && item.type === ResourceListType.CHART && (
                        <MenuItem2
                            icon="insert"
                            text="Add to Dashboard"
                            role="menuitem"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                setIsOpen(false);
                                onAction({
                                    type: ResourceListAction.ADD_TO_DASHBOARD,
                                    item,
                                });
                            }}
                        />
                    )}

                    {item.type === ResourceListType.CHART ||
                    item.type === ResourceListType.DASHBOARD ? (
                        <MenuItem2
                            tagName="div"
                            icon="folder-close"
                            text="Move to Space"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
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
                                        onClick={(e) => {
                                            // Use className disabled instead of disabled property to capture and preventdefault its clicks
                                            e.preventDefault();
                                            e.stopPropagation();

                                            if (!isSelected) {
                                                onAction({
                                                    type: ResourceListAction.MOVE_TO_SPACE,
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
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();

                                    onAction({
                                        type: ResourceListAction.CREATE_SPACE,
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
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            setIsOpen(false);
                            onAction({ type: ResourceListAction.DELETE, item });
                        }}
                    />
                </Menu>
            }
        >
            <Button
                icon="more"
                minimal
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    setIsOpen(true);
                }}
            />
        </Popover2>
    );
};

export default ResourceListActionMenu;
