import { Modal } from '@mantine/core';
import { FC } from 'react';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';

const UnderlyingDataModal: FC = () => {
    const { isUnderlyingDataModalOpen, closeUnderlyingDataModal } =
        useMetricQueryDataContext();

    return isUnderlyingDataModalOpen ? (
        <Modal.Root
            centered
            opened
            onClose={closeUnderlyingDataModal}
            size="auto"
        >
            <Modal.Overlay />
            <UnderlyingDataModalContent />
        </Modal.Root>
    ) : null;
};

export default UnderlyingDataModal;
