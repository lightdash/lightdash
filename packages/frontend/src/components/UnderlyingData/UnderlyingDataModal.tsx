import { Dialog } from '@blueprintjs/core';
import React, { FC } from 'react';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';
import { useUnderlyingDataContext } from './UnderlyingDataProvider';

interface Props {}

const UnderlyingDataModal: FC<Props> = () => {
    const { isModalOpen, closeModal } = useUnderlyingDataContext();

    return (
        <Dialog
            isOpen={isModalOpen}
            onClose={closeModal}
            lazy
            title={`View underlying data`}
            style={{
                width: '90%',
                height: '90vh',
                minHeight: '400px',
                minWidth: '500px',
            }}
        >
            <UnderlyingDataModalContent />
        </Dialog>
    );
};

export default UnderlyingDataModal;
