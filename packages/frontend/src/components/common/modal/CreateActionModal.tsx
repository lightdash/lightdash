import React, { useEffect, useState } from 'react';
import { UseMutationResult } from 'react-query';
import { UseFormReturn } from 'react-hook-form';
import { ApiError } from 'common';
import { ActionModalProps, ActionTypeModal } from './ActionModalTypes';
import ActionModal from './ActionModal';

type CreateActionModalProps = {
    useCreate: UseMutationResult<any, ApiError, any, unknown>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    isOpen: boolean;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    savedData?: any;
    onClose?: () => void;
};

const CreateActionModal = (props: CreateActionModalProps) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: any;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });
    const {
        useCreate,
        setFormValues,
        savedData,
        isOpen,
        onClose,
        ModalContent,
    } = props;
    const { status, mutate, isLoading } = useCreate;

    const onSubmitForm = (data?: any) => mutate({ ...savedData, ...data });

    useEffect(() => {
        setActionState({
            actionType: !isOpen
                ? ActionTypeModal.CLOSE
                : ActionTypeModal.UPDATE,
        });
    }, [isOpen]);

    return (
        <ActionModal
            useActionModalState={[actionState, setActionState]}
            isDisabled={isLoading}
            onSubmitForm={onSubmitForm}
            setFormValues={setFormValues}
            completedMutation={status === 'success'}
            ModalContent={ModalContent}
            onClose={onClose}
        />
    );
};

CreateActionModal.defaultProps = {
    savedData: {},
    onClose: () => {},
};

export default CreateActionModal;
