import { Button, Divider, Menu, MenuItem } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useDuplicateDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { useDuplicateMutation } from '../../../hooks/useSavedQuery';
import { useSpaces } from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import { ActionTypeModal } from './ActionModal';

type ModalActionButtonsProps = {
    data: any;
    url: string;
    setActionState: Dispatch<
        SetStateAction<{ actionType: number; data?: any }>
    >;
    isChart?: boolean;
};

const ModalActionButtons = ({
    data,
    url,
    setActionState,
    isChart,
}: ModalActionButtonsProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [itemId, setItemId] = useState<string>('');
    const { mutate: duplicateChart } = useDuplicateMutation(itemId, true);
    const { mutate: duplicateDashboard } = useDuplicateDashboardMutation(
        itemId,
        true,
    );
    const isDashboardPage = url.includes('/dashboards');
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: spaces } = useSpaces(projectUuid);

    const { user } = useApp();

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
            isOpen={isOpen}
            onClose={() => {
                setIsOpen(false);
            }}
            content={
                <Menu>
                    <MenuItem
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
                    <MenuItem
                        role="button"
                        icon="duplicate"
                        text="Duplicate"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!isChart) {
                                duplicateDashboard(itemId);
                            }
                            if (isChart) {
                                duplicateChart(itemId);
                            }
                            setIsOpen(false);
                        }}
                    />
                    {!isDashboardPage && (
                        <MenuItem
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

                    <MenuItem
                        icon="folder-close"
                        text="Move to Space"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            /*setIsOpen(false);
                            setActionState({
                                actionType: ActionTypeModal.MOVE_TO_SPACE,
                                data,
                            });*/
                        }}
                    >
                        {spaces?.map((space) => {
                            return (
                                <MenuItem
                                    text={space.name}
                                    disabled={data.spaceUuid === space.uuid}
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        /*setIsOpen(false);
                                    setActionState({
                                        actionType: ActionTypeModal.MOVE_TO_SPACE,
                                        data,
                                    });*/
                                    }}
                                />
                            );
                        })}

                        <Divider />
                        <MenuItem
                            text="Crete new space"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();

                                /*setIsOpen(false);
                            setActionState({
                                actionType: ActionTypeModal.MOVE_TO_SPACE,
                                data,
                            });*/
                            }}
                        />
                    </MenuItem>
                    <Divider />
                    <MenuItem
                        role="button"
                        icon="trash"
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
            placement="bottom"
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
