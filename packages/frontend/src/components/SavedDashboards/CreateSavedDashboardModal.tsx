import { Dashboard } from 'common';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../hooks/dashboard/useDashboard';
import { ActionModalProps } from '../common/modal/ActionModal';
import CreateActionModal from '../common/modal/CreateActionModal';

interface CreateSavedDashboardModalProps {
    isOpen: boolean;
    ModalContent: (
        props: Pick<
            ActionModalProps<Dashboard>,
            'useActionModalState' | 'isDisabled'
        >,
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
            savedData={{ tiles: [] }}
            {...props}
        />
    );
};

export default CreateSavedDashboardModal;
