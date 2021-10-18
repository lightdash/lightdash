import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError } from 'common';
import ActionModal, { ActionModalProps } from './ActionModal';

type DeleteActionModalProps = {
    useActionModalState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    useDelete: UseMutationResult<undefined, ApiError, string>;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
};

const DeleteActionModal = (props: DeleteActionModalProps) => {
    const { useDelete, useActionModalState, ModalContent } = props;
    const [actionState] = useActionModalState;
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

    return (
        <ActionModal
            useActionModalState={useActionModalState}
            isDisabled={isDeleting}
            onSubmitForm={onSubmitForm}
            completedMutation={statusDelete === 'success'}
            ModalContent={ModalContent}
        />
    );
};

export default DeleteActionModal;
