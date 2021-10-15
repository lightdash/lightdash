import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError, ActionTypeModal, ActionModalProps } from 'common';
import { UseFormReturn } from 'react-hook-form';
import ActionModal from './ActionModal';

type UpdateDeleteActionModalProps = {
    useActionState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    useDelete: UseMutationResult<undefined, ApiError, string>;
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    ModalForm: (
        props: Pick<ActionModalProps, 'actionState' | 'isDisabled'>,
    ) => JSX.Element;
};

const UpdateDeleteActionModal = (props: UpdateDeleteActionModalProps) => {
    const { useDelete, useUpdate, setFormValues, useActionState, ModalForm } =
        props;
    const [actionState, setActionState] = useActionState;
    const { data: { uuid: id } = {}, actionType } = actionState;
    const {
        status: statusUpdate,
        mutate,
        isLoading: isUpdating,
        reset: resetUpdate,
    } = useUpdate(id || null);
    const {
        status: statusDelete,
        mutate: deleteData,
        isLoading: isDeleting,
        reset: resetDelete,
    } = useDelete;

    const onSubmitForm = (data?: any) => {
        if (actionType === ActionTypeModal.UPDATE) {
            mutate(data);
        } else {
            deleteData(id);
        }
    };
    useEffect(() => {
        if (
            (actionType === ActionTypeModal.UPDATE && !isUpdating) ||
            (actionType === ActionTypeModal.DELETE && !isDeleting)
        ) {
            resetUpdate();
            resetDelete();
        }
    }, [isUpdating, isDeleting, actionType, resetUpdate, resetDelete]);

    const onClose = () =>
        !isDeleting
            ? setActionState({ actionType: ActionTypeModal.CLOSE })
            : undefined;
    return (
        <ActionModal
            actionState={actionState}
            isDisabled={isUpdating || isDeleting}
            onSubmitForm={onSubmitForm}
            setFormValues={setFormValues}
            completedMutation={
                statusUpdate === 'success' || statusDelete === 'success'
            }
            onClose={onClose}
            ModalForm={ModalForm}
        />
    );
};

export default UpdateDeleteActionModal;
