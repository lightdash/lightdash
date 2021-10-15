import React, { Dispatch, SetStateAction } from 'react';
import { UseMutationResult } from 'react-query';
import { UseFormReturn } from 'react-hook-form';
import { ApiError } from 'common';
import { ActionTypeModal } from './ActionModalTypes';
import ActionModal from './ActionModal';
import SavedQueryForm from '../../SavedQueries/SavedQueryForm';

type CreateActionModalProps = {
    useActionState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    useCreate: UseMutationResult<any, ApiError, any, unknown>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    savedData: any;
};

const CreateActionModal = (props: CreateActionModalProps) => {
    const { useCreate, setFormValues, useActionState, savedData } = props;
    const [actionState, setActionState] = useActionState;
    const { status, mutate, isLoading } = useCreate;

    const onSubmitForm = (data?: any) => {
        mutate({ ...savedData, ...data });
    };
    const onClose = () => setActionState({ actionType: ActionTypeModal.CLOSE });
    return (
        <ActionModal
            actionState={actionState}
            isDisabled={isLoading}
            onSubmitForm={onSubmitForm}
            setFormValues={setFormValues}
            completedMutation={status === 'success'}
            onClose={onClose}
            ModalForm={SavedQueryForm}
        />
    );
};

export default CreateActionModal;
