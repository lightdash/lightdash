import { Intent } from '@blueprintjs/core';
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
    return (
        <CreateActionModal
            useCreate={useCreate}
            confirmButtonIntent={Intent.SUCCESS}
            confirmButtonLabel="Save"
            title="Save chart"
            {...props}
        />
    );
};

export default CreateSavedQueryModal;
