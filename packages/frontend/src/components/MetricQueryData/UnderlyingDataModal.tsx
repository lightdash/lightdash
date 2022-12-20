import { Dialog } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';

interface Props {}

const UnderlyingDataModal: FC<Props> = () => {
    const { isUnderlyingDataModalOpen, closeUnderlyingDataModal } =
        useMetricQueryDataContext();

    return (
        <Dialog
            isOpen={isUnderlyingDataModalOpen}
            onClose={closeUnderlyingDataModal}
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
