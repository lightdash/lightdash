import { Button, ButtonGroup } from '@blueprintjs/core';
import React, { Dispatch, SetStateAction } from 'react';
import { ActionTypeModal, SpaceQuery } from 'common';
import { useHistory } from 'react-router-dom';

type ModalActionButtonsProps = {
    data: Pick<SpaceQuery, 'uuid' | 'name'>;
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
    const { push } = useHistory();
    return (
        <ButtonGroup>
            <Button
                icon="document-open"
                intent="primary"
                outlined
                onClick={() => push({ pathname: url })}
                text="Open"
            />
            <Button
                icon="edit"
                intent="warning"
                outlined
                text="Rename"
                onClick={() =>
                    setActionState({ actionType: ActionTypeModal.UPDATE, data })
                }
            />
            <Button
                icon="delete"
                intent="danger"
                outlined
                onClick={() =>
                    setActionState({ actionType: ActionTypeModal.DELETE, data })
                }
                text="Delete"
            />
        </ButtonGroup>
    );
};

export default ModalActionButtons;
