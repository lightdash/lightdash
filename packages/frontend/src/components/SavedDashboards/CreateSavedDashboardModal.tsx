import { UseFormReturn } from 'react-hook-form';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import CreateActionModal from '../common/modal/CreateActionModal';
import { useCreateMutation } from '../../hooks/dashboard/useDashboard';
import { ActionModalProps } from '../common/modal/ActionModalTypes';

interface CreateSavedDashboardModalProps {
    isOpen: boolean;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    onClose?: () => void;
}

const CreateSavedDashboardModal: FC<CreateSavedDashboardModalProps> = (
    props,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const useCreate = useCreateMutation(projectUuid);
    return (
        <CreateActionModal
            useCreate={useCreate}
            setFormValues={(data: any, methods: UseFormReturn<any, object>) => {
                const { setValue } = methods;
                if (data?.name) {
                    setValue('name', data?.name);
                }
            }}
            savedData={{ tiles: [] }}
            {...props}
        />
    );
};

export default CreateSavedDashboardModal;
