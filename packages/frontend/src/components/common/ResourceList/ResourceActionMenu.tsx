import { Button, Divider, Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Space } from '@lightdash/common';
import { FC, useEffect, useState } from 'react';
import { AcceptedResourceTypes } from '.';
import { useDuplicateDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { useDuplicateMutation } from '../../../hooks/useSavedQuery';
import { useApp } from '../../../providers/AppProvider';

export enum ResourceAction {
    CLOSE,
    UPDATE,
    ADD_TO_DASHBOARD,
    DELETE,
    MOVE_TO_SPACE,
    CREATE_SPACE,
}

type Props = {
    data: any;
    spaces: Space[];
    url: string;
    onAction: (
        action: ResourceAction,
        resource: AcceptedResourceTypes,
        data?: any,
    ) => void;
    isChart?: boolean;
};

const ResourceActionMenu: FC<Props> = ({
    data,
    spaces,
    url,
    onAction,
    isChart = false,
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [itemId, setItemId] = useState<string>('');

    const { user } = useApp();
    const { mutate: duplicateChart } = useDuplicateMutation(itemId, true);
    const { mutate: duplicateDashboard } = useDuplicateDashboardMutation(
        itemId,
        true,
    );
    const isDashboardPage = url.includes('/dashboards') || !isChart;

    useEffect(() => {
        setItemId(data.uuid);
    }, [data.uuid]);

    if (isChart) {
        if (user.data?.ability?.cannot('manage', 'SavedChart')) return <></>;
    } else {
        if (user.data?.ability?.cannot('manage', 'Dashboard')) return <></>;
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
                            onAction(ResourceAction.UPDATE, 'chart', data);
                        }}
                    />
                    <MenuItem2
                        role="menuitem"
                        icon="duplicate"
                        text="Duplicate"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();

                            if (isChart) {
                                duplicateChart(itemId);
                            } else {
                                duplicateDashboard(itemId);
                            }

                            setIsOpen(false);
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
                                onAction(
                                    ResourceAction.ADD_TO_DASHBOARD,
                                    'chart',
                                    data,
                                );
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
                            const isSelected = data.spaceUuid === space.uuid;
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
                                            onAction(
                                                ResourceAction.MOVE_TO_SPACE,
                                                'chart',
                                                {
                                                    ...data,
                                                    spaceUuid: space.uuid,
                                                },
                                            );
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
                                onAction(
                                    ResourceAction.CREATE_SPACE,
                                    'chart',
                                    data,
                                );
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
                            onAction(ResourceAction.DELETE, 'chart', data);
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

export default ResourceActionMenu;
