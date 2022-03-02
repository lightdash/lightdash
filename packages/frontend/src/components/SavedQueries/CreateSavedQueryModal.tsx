import { CreateSavedChartVersion, SpaceQuery } from 'common';

import React, { FC } from 'react';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import { ActionModalProps } from '../common/modal/ActionModal';
import CreateActionModal from '../common/modal/CreateActionModal';

interface CreateSavedQueryModalProps {
    isOpen: boolean;
    savedData: CreateSavedChartVersion;
    ModalContent: (
        props: Pick<
            ActionModalProps<SpaceQuery>,
            'useActionModalState' | 'isDisabled'
        >,
    ) => JSX.Element;
    onClose?: () => void;
}

const CreateSavedQueryModal: FC<CreateSavedQueryModalProps> = (props) => {
    const useCreate = useCreateMutation();
    return <CreateActionModal useCreate={useCreate} {...props} />;
};

export default CreateSavedQueryModal;
