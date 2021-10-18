import { SavedQuery } from 'common';
import React, { FC } from 'react';
import { useCreateMutation } from '../../hooks/useSavedQuery';
import CreateActionModal from '../common/modal/CreateActionModal';
import { ActionModalProps } from '../common/modal/ActionModal';

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
    return <CreateActionModal useCreate={useCreate} {...props} />;
};

export default CreateSavedQueryModal;
