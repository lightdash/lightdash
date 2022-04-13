import { Button, Menu, MenuItem } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { useDuplicateDashboardMutation } from '../../../hooks/dashboard/useDashboard';
import { useDuplicateMutation } from '../../../hooks/useSavedQuery';
import { ActionTypeModal } from './ActionModal';

type ModalActionButtonsProps = {
    data: any;
    url: string;
    setActionState: Dispatch<
        SetStateAction<{ actionType: number; data?: any }>
    >;
};

const ModalActionButtons = ({
    data,
    url,
    setActionState,
}: ModalActionButtonsProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const [itemId, setItemId] = useState<string>('');
    const { mutate: duplicateChart } = useDuplicateMutation(itemId);
    const { mutate: duplicateDashboard } =
        useDuplicateDashboardMutation(itemId);

    useEffect(() => {
        setItemId(data.uuid);
    }, []);

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
                            if (data.projectUuid || data.description) {
                                duplicateDashboard(itemId);
                            }
                            if (!data.projectUuid && !data.description) {
                                duplicateChart(itemId);
                            }
                            setIsOpen(false);
                        }}
                    />
                    <MenuItem
                        role="button"
                        icon="delete"
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

export default ModalActionButtons;
