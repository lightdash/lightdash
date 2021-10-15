import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError } from 'common';
import { UseFormReturn } from 'react-hook-form';
import { ActionTypeModal, ActionModalProps } from './ActionModalTypes';
import ActionModal from './ActionModal';

type DeleteActionModalProps = {
    useActionState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    useDelete: UseMutationResult<undefined, ApiError, string>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    ModalForm: (
        props: Pick<ActionModalProps, 'actionState' | 'isDisabled'>,
    ) => JSX.Element;
};

const DeleteActionModal = (props: DeleteActionModalProps) => {
    const { useDelete, setFormValues, useActionState, ModalForm } = props;
    const [actionState, setActionState] = useActionState;
    const { data: { uuid: id } = {}, actionType } = actionState;
    const {
        status: statusDelete,
        mutate: deleteData,
        isLoading: isDeleting,
        reset: resetDelete,
    } = useDelete;

    const onSubmitForm = () => {
        deleteData(id);
    };
    useEffect(() => {
        if (!isDeleting) {
            resetDelete();
        }
    }, [isDeleting, actionType, resetDelete]);

    const onClose = () =>
        !isDeleting
            ? setActionState({ actionType: ActionTypeModal.CLOSE })
            : undefined;
    return (
        <ActionModal
            actionState={actionState}
            isDisabled={isDeleting}
            onSubmitForm={onSubmitForm}
            setFormValues={setFormValues}
            completedMutation={statusDelete === 'success'}
            onClose={onClose}
            ModalForm={ModalForm}
        />
    );
};

export default DeleteActionModal;
