import { Button, Divider, Menu, Position } from '@blueprintjs/core';
import { MenuItem2, Popover2 } from '@blueprintjs/popover2';
import { Space } from '@lightdash/common';
import { Dispatch, FC, SetStateAction, useEffect, useState } from 'react';
import { useDuplicateDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { useDuplicateMutation } from '../../../hooks/useSavedQuery';
import { useApp } from '../../../providers/AppProvider';
import { ActionTypeModal } from './ActionModal';

type ModalActionButtonsProps = {
    data: any;
    spaces: Space[];
    url: string;
    setActionState: Dispatch<
        SetStateAction<{ actionType: number; data?: any }>
    >;
    isChart?: boolean;
};

const ModalActionButtons: FC<ModalActionButtonsProps> = ({
    data,
    spaces,
    url,
    setActionState,
    isChart,
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
                        role="button"
                        icon="edit"
                        text="Rename"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsOpen(false);
                            setActionState({
                                actionType: ActionTypeModal.UPDATE,
                                data,
                            });
                        }}
                    />
                    <MenuItem2
                        role="button"
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
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsOpen(false);
                                setActionState({
                                    actionType:
                                        ActionTypeModal.ADD_TO_DASHBOARD,
                                    data,
                                });
                            }}
                        />
                    )}

                    <MenuItem2
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
                                        if (!isSelected)
                                            setActionState({
                                                actionType:
                                                    ActionTypeModal.MOVE_TO_SPACE,
                                                data: {
                                                    ...data,
                                                    spaceUuid: space.uuid,
                                                },
                                            });
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
                                setActionState({
                                    actionType: ActionTypeModal.CREATE_SPACE,
                                    data,
                                });
                            }}
                        />
                    </MenuItem2>

                    <Divider />

                    <MenuItem2
                        role="button"
                        icon="cross"
                        text="Delete"
                        intent="danger"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsOpen(false);
                            setActionState({
                                actionType: ActionTypeModal.DELETE,
                                data,
                            });
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

ModalActionButtons.defaultProps = {
    isChart: false,
};

export default ModalActionButtons;
