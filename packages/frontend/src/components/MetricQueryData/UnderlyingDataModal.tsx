import { Modal, Title } from '@mantine/core';
import { FC } from 'react';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';

const UnderlyingDataModal: FC = () => {
    const { isUnderlyingDataModalOpen, closeUnderlyingDataModal } =
        useMetricQueryDataContext();

    return (
        <Modal
            centered
            opened={isUnderlyingDataModalOpen}
            onClose={closeUnderlyingDataModal}
            title={<Title order={5}>View underlying data</Title>}
            size="auto"
            styles={{
                body: {
                    height: '100%',
                },
                content: {
                    minWidth: 'calc(100dvh)',
                    minHeight: 'calc(100dvh - (4rem * 2))',
                    height: 'calc(100dvh - (10rem * 2))',
                    overflowY: 'hidden',
                },
            }}
        >
            <UnderlyingDataModalContent />
        </Modal>
    );
};

export default UnderlyingDataModal;
