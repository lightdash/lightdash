import { Button, Divider, Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { assertUnreachable, Space } from '@lightdash/common';
import { FC, useState } from 'react';
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
    const isDashboardPage =
        url.includes('/dashboards') || item.type === ResourceListType.DASHBOARD;

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
                    {!isDashboardPage && (
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
                                    className={isSelected ? 'bp4-disabled' : ''}
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
