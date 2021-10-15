import { ActionTypeModal, SavedQuery } from 'common';
import React, { FC, useEffect, useState } from 'react';
import { UseFormReturn } from 'react-hook-form';
import { useCreateMutation } from '../../../hooks/useSavedQuery';
import CreateActionModal from '../../common/modal/CreateActionModal';

interface CreateSavedQueryModalProps {
    isOpen: boolean;
    queryData: Omit<SavedQuery, 'uuid' | 'name'>;
}

const CreateSavedQueryModal: FC<CreateSavedQueryModalProps> = ({
    isOpen,
    queryData,
}) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: any;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });
    const useCreate = useCreateMutation();

    useEffect(() => {
        setActionState({
            actionType: !isOpen
                ? ActionTypeModal.CLOSE
                : ActionTypeModal.UPDATE,
        });
    }, [isOpen]);

    return (
        <CreateActionModal
            useActionState={[actionState, setActionState]}
            useCreate={useCreate}
            setFormValues={(data: any, methods: UseFormReturn<any, object>) => {
                const { setValue } = methods;
                if (data?.name) {
                    setValue('name', data?.name);
                }
            }}
            savedData={queryData}
        />
    );
};

export default CreateSavedQueryModal;
