import React from 'react';
import {
    ActionModalProps,
    ActionTypeModal,
} from '../common/modal/ActionModalTypes';
import Input from '../ReactHookForm/Input';

const SavedQueryForm = ({
    actionState: { actionType },
    isDisabled,
}: Pick<ActionModalProps, 'actionState' | 'isDisabled'>) => (
    <>
        {actionType === ActionTypeModal.UPDATE && (
            <Input
                label="Name"
                name="name"
                disabled={isDisabled}
                rules={{ required: true }}
            />
        )}
        {actionType === ActionTypeModal.DELETE && (
            <p>Are you sure you want to delete this chart ?</p>
        )}
    </>
);

export default SavedQueryForm;
