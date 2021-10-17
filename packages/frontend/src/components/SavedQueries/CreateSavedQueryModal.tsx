import { SavedQuery } from 'common';
import { UseFormReturn } from 'react-hook-form';
import React, { FC } from 'react';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import CreateActionModal from '../common/modal/CreateActionModal';
import { ActionModalProps } from '../common/modal/ActionModalTypes';

interface CreateSavedQueryModalProps {
    isOpen: boolean;
    savedData: Omit<SavedQuery, 'uuid' | 'name'>;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    onClose?: () => void;
}

const CreateSavedQueryModal: FC<CreateSavedQueryModalProps> = (props) => {
    const useCreate = useCreateMutation();
    return (
        <CreateActionModal
            useCreate={useCreate}
            setFormValues={(data: any, methods: UseFormReturn<any, object>) => {
                const { setValue } = methods;
                if (data?.name) {
                    setValue('name', data?.name);
                }
            }}
            {...props}
        />
    );
};

export default CreateSavedQueryModal;
