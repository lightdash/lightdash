import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError } from 'common';
import { UseFormReturn } from 'react-hook-form';
import { ActionTypeModal, ActionModalProps } from './ActionModalTypes';
import ActionModal from './ActionModal';

type UpdateActionModalProps = {
    useActionState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    ModalForm: (
        props: Pick<ActionModalProps, 'actionState' | 'isDisabled'>,
    ) => JSX.Element;
};

const UpdateActionModal = (props: UpdateActionModalProps) => {
    const { useUpdate, setFormValues, useActionState, ModalForm } = props;
    const [actionState, setActionState] = useActionState;
    const { data: { uuid: id } = {}, actionType } = actionState;
    const {
        status: statusUpdate,
        mutate,
        isLoading: isUpdating,
        reset: resetUpdate,
    } = useUpdate(id || null);

    const onSubmitForm = (data?: any) => {
        mutate(data);
    };
    useEffect(() => {
        if (!isUpdating) {
            resetUpdate();
        }
    }, [isUpdating, actionType, resetUpdate]);

    const onClose = () => setActionState({ actionType: ActionTypeModal.CLOSE });
    return (
        <ActionModal
            actionState={actionState}
            isDisabled={isUpdating}
            onSubmitForm={onSubmitForm}
            setFormValues={setFormValues}
            completedMutation={statusUpdate === 'success'}
            onClose={onClose}
            ModalForm={ModalForm}
        />
    );
};

export default UpdateActionModal;
