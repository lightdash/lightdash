import { Button, Menu, MenuItem } from '@blueprintjs/core';
import React, { Dispatch, SetStateAction } from 'react';
import { Popover2 } from '@blueprintjs/popover2';
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
}: ModalActionButtonsProps) => (
    <Popover2
        content={
            <Menu>
                <MenuItem
                    icon="edit"
                    text="Rename"
                    onClick={() =>
                        setActionState({
                            actionType: ActionTypeModal.UPDATE,
                            data,
                        })
                    }
                />
                <MenuItem
                    icon="delete"
                    text="Delete"
                    onClick={() =>
                        setActionState({
                            actionType: ActionTypeModal.DELETE,
                            data,
                        })
                    }
                />
            </Menu>
        }
        placement="bottom"
    >
        <Button icon="more" minimal />
    </Popover2>
);

export default ModalActionButtons;
