import { Button, Menu, MenuItem } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import React, { Dispatch, SetStateAction, useState } from 'react';
import useDuplicate from '../../../hooks/useDuplicate';
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
    const [chartId, setChartId] = useState<string>('');
    const { onDuplicateChart } = useDuplicate(chartId);

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
                            setChartId(data.uuid);
                            onDuplicateChart();
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
