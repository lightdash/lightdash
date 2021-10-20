import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError } from 'common';
import { Intent } from '@blueprintjs/core';
import ActionModal, { ActionModalProps } from './ActionModal';

type DeleteActionModalProps<T> = {
    useActionModalState: [
        { actionType: number; data?: T },
        Dispatch<SetStateAction<{ actionType: number; data?: T }>>,
    ];
    useDelete: UseMutationResult<undefined, ApiError, string>;
    ModalContent: (
        props: Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
};

const DeleteActionModal = <T extends { uuid: string; name: string }>(
    props: DeleteActionModalProps<T>,
) => {
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
        if (id) {
            deleteData(id);
        }
    };
    useEffect(() => {
        if (!isDeleting) {
            resetDelete();
        }
    }, [isDeleting, actionType, resetDelete]);

    return (
        <ActionModal
            title="Delete"
            confirmButtonLabel="Delete"
            confirmButtonIntent={Intent.DANGER}
            useActionModalState={useActionModalState}
            isDisabled={isDeleting}
            onSubmitForm={onSubmitForm}
            completedMutation={statusDelete === 'success'}
            ModalContent={ModalContent}
        />
    );
};

export default DeleteActionModal;
