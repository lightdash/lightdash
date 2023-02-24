import { Dialog } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { useMetricQueryDataContext } from './MetricQueryDataProvider';
import UnderlyingDataModalContent from './UnderlyingDataModalContent';

const UnderlyingDataModal: FC<{
    trackingData: {
        organizationId: string | undefined;
        userId: string | undefined;
        projectId: string | undefined;
    };
}> = ({ trackingData }) => {
    const { isUnderlyingDataModalOpen, closeUnderlyingDataModal } =
        useMetricQueryDataContext();
    const { track } = useTracking();

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
            {isUnderlyingDataModalOpen &&
                track({
                    name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
                    properties: {
                        organizationId: trackingData.organizationId,
                        userId: trackingData.userId,
                        projectId: trackingData.projectId,
                    },
                })}
            <UnderlyingDataModalContent />
        </Dialog>
    );
};

export default UnderlyingDataModal;
