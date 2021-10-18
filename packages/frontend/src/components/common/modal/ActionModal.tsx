import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { Button, Intent } from '@blueprintjs/core';
import { useForm, UseFormReturn } from 'react-hook-form';
import BaseModal from './BaseModal';
import { useApp } from '../../../providers/AppProvider';

export enum ActionTypeModal {
    CLOSE,
    UPDATE,
    DELETE,
}

export type ActionModalProps = {
    useActionModalState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    isDisabled: boolean;
    onSubmitForm: (data: any) => void;
    completedMutation: boolean;
    setFormValues?: (data: any, methods: UseFormReturn<any, object>) => void;
    onClose?: () => void;
};

const ActionModal = (props: ActionModalProps) => {
    const { isDisabled, completedMutation, useActionModalState } = props;
    const { showToastError } = useApp();

    const methods = useForm<any>({
        mode: 'onSubmit',
    });
    const [actionState, setActionState] = useActionModalState;
    const { data: currentData, actionType } = actionState;
    const { onSubmitForm, setFormValues, ModalContent } = props;

    const onClose = () => {
        if (!isDisabled) {
            setActionState({ actionType: ActionTypeModal.CLOSE });
            if (props.onClose) {
                props.onClose();
                // reset fields for new modal
                methods.reset();
            }
        }
    };

    useEffect(() => {
        if (actionType !== ActionTypeModal.CLOSE && completedMutation) {
            onClose();
        }
    }, [onClose, completedMutation, actionType]);

    // set initial value only
    useEffect(() => {
        if (currentData) {
            if (setFormValues) {
                setFormValues(currentData, methods);
            }
        }
    }, [currentData]);

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

    return (
        <BaseModal
            canOutsideClickClose={!(actionType === ActionTypeModal.DELETE)}
            title={actionType === ActionTypeModal.UPDATE ? 'Save' : 'Settings'}
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
