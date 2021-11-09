import { SpaceQuery } from 'common';
import React from 'react';
import { ActionModalProps, ActionTypeModal } from '../common/modal/ActionModal';
import Input from '../ReactHookForm/Input';

const SavedQueryForm = ({
    useActionModalState,
    isDisabled,
}: Pick<
    ActionModalProps<SpaceQuery>,
    'useActionModalState' | 'isDisabled'
>) => {
    const [{ actionType, data }] = useActionModalState;
    return (
        <>
            {actionType === ActionTypeModal.UPDATE && (
                <Input
                    label="Name"
                    name="name"
                    disabled={isDisabled}
                    rules={{ required: true }}
                    defaultValue={data?.name}
                />
            )}
            {actionType === ActionTypeModal.DELETE && (
                <p>Are you sure you want to delete this chart ?</p>
            )}
        </>
    );
};

export default SavedQueryForm;
