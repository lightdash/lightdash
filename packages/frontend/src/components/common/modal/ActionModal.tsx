import React, { useEffect } from 'react';
import { ActionModalProps, ActionTypeModal } from 'common';
import { Button, Intent } from '@blueprintjs/core';
import { useForm } from 'react-hook-form';
import BaseModal from './BaseModal';
import { useApp } from '../../../providers/AppProvider';

const ActionModal = (props: ActionModalProps) => {
    const { isDisabled, completedMutation, actionState } = props;
    const { showToastError } = useApp();

    const methods = useForm<any>({
        mode: 'onSubmit',
        defaultValues: {
            name: '',
        },
    });

    const { data: currentData, actionType } = actionState;
    const { onSubmitForm, setFormValues, onClose, ModalForm } = props;

    useEffect(() => {
        if (actionType !== ActionTypeModal.CLOSE && completedMutation) {
            onClose();
        }
    }, [onClose, completedMutation]);

    useEffect(() => {
        if (currentData) {
            setFormValues(currentData, methods);
        }
    }, [currentData, methods, setFormValues]);

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
            renderBody={() => <ModalForm {...props} />}
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
