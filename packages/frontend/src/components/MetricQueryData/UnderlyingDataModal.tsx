import { Modal } from '@mantine/core';
import { FC } from 'react';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';

const UnderlyingDataModal: FC = () => {
    const { isUnderlyingDataModalOpen, closeUnderlyingDataModal } =
        useMetricQueryDataContext();

    return (
        <Modal.Root
            centered
            opened={isUnderlyingDataModalOpen}
            onClose={closeUnderlyingDataModal}
            size="auto"
        >
            <Modal.Overlay />
            <UnderlyingDataModalContent />
        </Modal.Root>
    );
};

export default UnderlyingDataModal;
