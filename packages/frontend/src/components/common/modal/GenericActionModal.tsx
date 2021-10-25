import React, { useEffect, useState } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError } from 'common';
import ActionModal, { ActionModalProps, ActionTypeModal } from './ActionModal';

type GenericActionModalProps<T> = {
    title: string;
    confirmButtonLabel: string;
    isOpen: boolean;
    ModalContent: (
        props: Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    useDB: UseMutationResult<any, ApiError, any, unknown>;
    onSubmit: (data: any) => void;
    onClose?: () => void;
    dataModal?: T;
};

const GenericActionModal = <T extends object>(
    props: GenericActionModalProps<T>,
) => {
    const {
        title,
        confirmButtonLabel,
        isOpen,
        ModalContent,
        useDB,
        onSubmit,
        onClose,
        dataModal,
    } = props;
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: T;
    }>({
        actionType: ActionTypeModal.CLOSE,
        data: dataModal,
    });
    const { actionType } = actionState;
    const { reset, isLoading, status } = useDB;

    useEffect(() => {
        if (!isLoading) {
            reset();
        }
    }, [isLoading, actionType, reset]);

    useEffect(() => {
        setActionState({
            actionType: !isOpen
                ? ActionTypeModal.CLOSE
                : ActionTypeModal.UPDATE,
        });
    }, [isOpen]);

    return (
        <ActionModal
            title={title}
            confirmButtonLabel={confirmButtonLabel}
            useActionModalState={[actionState, setActionState]}
            isDisabled={isLoading}
            onSubmitForm={onSubmit}
            completedMutation={status === 'success'}
            ModalContent={ModalContent}
            onClose={onClose}
        />
    );
};

GenericActionModal.defaultProps = {
    onClose: () => {},
    dataModal: {},
};

export default GenericActionModal;
