import { CreateDashboard, Dashboard, DashboardBasicDetails } from 'common';
import React, { FC } from 'react';
import { useParams } from 'react-router-dom';
import { useCreateMutation } from '../../hooks/dashboard/useDashboard';
import { ActionModalProps } from '../common/modal/ActionModal';
import CreateActionModal from '../common/modal/CreateActionModal';

interface CreateSavedDashboardModalProps {
    isOpen: boolean;
    ModalContent: (
        props: Pick<
            ActionModalProps<DashboardBasicDetails>,
            'useActionModalState' | 'isDisabled'
        >,
    ) => JSX.Element;
    tiles?: Dashboard['tiles'];
    showRedirectButton?: boolean;
    onClose?: () => void;
}

const CreateSavedDashboardModal: FC<CreateSavedDashboardModalProps> = (
    props,
) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { tiles, showRedirectButton } = props;
    const useCreate = useCreateMutation(projectUuid, showRedirectButton);

    return (
        <CreateActionModal
            useCreate={useCreate}
            savedData={
                {
                    tiles: tiles || [],
                    filters: { dimensions: [], metrics: [] },
                } as Partial<CreateDashboard>
            }
            {...props}
        />
    );
};

export default CreateSavedDashboardModal;
