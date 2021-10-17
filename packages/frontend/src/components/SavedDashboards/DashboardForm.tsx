import React from 'react';
import {
    ActionModalProps,
    ActionTypeModal,
} from '../common/modal/ActionModalTypes';
import Input from '../ReactHookForm/Input';

const DashboardForm = ({
    useActionModalState,
    isDisabled,
}: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'> & any) => {
    const [{ actionType }] = useActionModalState;
    return (
        <>
            {actionType === ActionTypeModal.UPDATE && (
                <>
                    <Input
                        label="Name"
                        name="name"
                        disabled={isDisabled}
                        rules={{ required: true }}
                    />
                    <Input
                        label="Description"
                        name="description"
                        disabled={isDisabled}
                    />
                </>
            )}
            {actionType === ActionTypeModal.DELETE && (
                <p>Are you sure you want to delete this dashboard ?</p>
            )}
        </>
    );
};

export default DashboardForm;
