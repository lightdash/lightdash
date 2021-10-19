import React, { Dispatch, SetStateAction, useEffect, useCallback } from 'react';
import { Button, Intent } from '@blueprintjs/core';
import { useForm, UseFormReturn } from 'react-hook-form';
import BaseModal from './BaseModal';
import { useApp } from '../../../providers/AppProvider';

export enum ActionTypeModal {
    CLOSE,
    UPDATE,
    DELETE,
}

export type ActionModalProps<T> = {
    title?: string;
    useActionModalState: [
        { actionType: number; data?: T },
        Dispatch<SetStateAction<{ actionType: number; data?: T }>>,
    ];
    ModalContent: (
        props: Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    isDisabled: boolean;
    onSubmitForm: (data: T) => void;
    completedMutation: boolean;
    setFormValues?: (data: any, methods: UseFormReturn<any, object>) => void;
    onClose?: () => void;
};

const ActionModal = <T extends object>(props: ActionModalProps<T>) => {
    const {
        title,
        isDisabled,
        completedMutation,
        useActionModalState: [
            { data: currentData, actionType },
            setActionState,
        ],
        onClose: onCloseModal,
        onSubmitForm,
        ModalContent,
    } = props;
    const { showToastError } = useApp();

    const methods = useForm<any>({
        mode: 'onSubmit',
        defaultValues: currentData,
    });

    const onClose = useCallback(() => {
        if (!isDisabled) {
            setActionState({ actionType: ActionTypeModal.CLOSE });
            if (onCloseModal) {
                onCloseModal();
                // reset fields for new modal
                methods.reset();
            }
        }
    }, [isDisabled, methods, onCloseModal, setActionState]);

    useEffect(() => {
        if (actionType !== ActionTypeModal.CLOSE && completedMutation) {
            onClose();
        }
    }, [onClose, completedMutation, actionType]);

    const handleSubmit = (data?: any) => {
        try {
            onSubmitForm(data);
        } catch (e) {
            showToastError({
                title: 'Error saving',
                subtitle: e.message,
            });
        }
    };

    const fallbackTitle =
        actionType === ActionTypeModal.UPDATE ? 'Save' : 'Settings';

    return (
        <BaseModal
            canOutsideClickClose={!(actionType === ActionTypeModal.DELETE)}
            title={title || fallbackTitle}
            isOpen={actionType !== ActionTypeModal.CLOSE}
            icon={actionType === ActionTypeModal.DELETE && 'cog'}
            onClose={onClose}
            methods={methods}
            handleSubmit={handleSubmit}
            renderBody={() => <ModalContent {...props} />}
            renderFooter={() => (
                <>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        disabled={isDisabled}
                        intent={
                            actionType === ActionTypeModal.DELETE
                                ? Intent.DANGER
                                : Intent.PRIMARY
                        }
                        type="submit"
                        text={
                            actionType === ActionTypeModal.DELETE
                                ? 'Delete'
                                : 'Save'
                        }
                        loading={isDisabled}
                    />
                </>
            )}
        />
    );
};

export default ActionModal;
