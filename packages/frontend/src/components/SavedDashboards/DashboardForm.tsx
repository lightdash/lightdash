import { Dashboard } from 'common';
import React from 'react';
import { ActionModalProps, ActionTypeModal } from '../common/modal/ActionModal';
import Input from '../ReactHookForm/Input';

const DashboardForm = ({
    useActionModalState,
    isDisabled,
}: Pick<ActionModalProps<Dashboard>, 'useActionModalState' | 'isDisabled'>) => {
    const [{ actionType, data }] = useActionModalState;
    return (
        <>
            {actionType === ActionTypeModal.UPDATE && (
                <>
                    <Input
                        label="Name"
                        name="name"
                        disabled={isDisabled}
                        rules={{ required: true }}
                        defaultValue={data?.name}
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
