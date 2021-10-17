import React, { Dispatch, SetStateAction, useEffect } from 'react';
import { UseMutationResult } from 'react-query';
import { ApiError } from 'common';
import { UseFormReturn } from 'react-hook-form';
import { ActionModalProps } from './ActionModalTypes';
import ActionModal from './ActionModal';

type UpdateActionModalProps = {
    useActionModalState: [
        { actionType: number; data?: any },
        Dispatch<SetStateAction<{ actionType: number; data?: any }>>,
    ];
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
};

const UpdateActionModal = (props: UpdateActionModalProps) => {
    const { useUpdate, setFormValues, useActionModalState, ModalContent } =
        props;
    const [actionState, setActionState] = useActionModalState;
    const { data: { uuid: id } = {}, actionType } = actionState;
    const {
        status: statusUpdate,
        mutate,
        isLoading: isUpdating,
        reset: resetUpdate,
    } = useUpdate(id || null);

    const onSubmitForm = (data?: any) => {
        mutate(data);
    };

    useEffect(() => {
        if (!isUpdating) {
            resetUpdate();
        }
    }, [isUpdating, actionType, resetUpdate]);

    return (
        <ActionModal
            useActionModalState={[actionState, setActionState]}
            isDisabled={isUpdating}
            onSubmitForm={onSubmitForm}
            setFormValues={setFormValues}
            completedMutation={statusUpdate === 'success'}
            ModalContent={ModalContent}
        />
    );
};

export default UpdateActionModal;
