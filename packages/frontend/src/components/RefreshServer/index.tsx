import React, { ComponentProps, FC, useEffect, useState } from 'react';
import {
    useGetRefreshData,
    useRefreshServer,
} from '../../hooks/useRefreshServer';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import {
    refreshStatusInfo,
    runningStepsInfo,
} from '../../utils/refreshStatusInfo';
import { BigButton } from '../common/BigButton';
import {
    LoadingSpinner,
    RefreshButton,
    RefreshSpinnerButton,
} from './RefreshServerButton.styles';
import RefreshStepsModal from './RefreshStepsModal';

const RefreshServerButton: FC<ComponentProps<typeof BigButton>> = (props) => {
    const [isRefreshStepsOpen, setIsRefreshStepsOpen] = useState(false);
    const { data, mutate } = useRefreshServer();
    const [isRefreshTriggered, setIsRefreshTriggered] = useState(false);

    const { data: statusInfo } = useGetRefreshData(
        isRefreshTriggered ? data?.jobUuid : undefined,
    );
    const isLoading = statusInfo ? statusInfo.jobStatus !== 'DONE' : false;
    const { track } = useTracking();
    const { showToastInfo } = useApp();
    const hasSteps = !!statusInfo?.steps.length;

    useEffect(() => {
        if (statusInfo && isLoading && statusInfo.jobStatus !== 'DONE') {
            showToastInfo({
                title: `${refreshStatusInfo(statusInfo?.jobStatus).title} `,
                subtitle: hasSteps
                    ? `Steps ${
                          runningStepsInfo(statusInfo?.steps)
                              .completedStepsMessage
                      }: ${runningStepsInfo(statusInfo?.steps).runningStep}`
                    : '',
                icon: `${refreshStatusInfo(statusInfo?.jobStatus).icon}`,
                // TO BE UNCOMMENTED WHEN STEPS ARE IMPLEMENTED ON THE BE
                // action: {
                //     text: 'View log ',
                //     icon: 'arrow-right',
                //     onClick: () => setIsRefreshStepsOpen(true),
                // },
            });
        }
    }, [isLoading, statusInfo, showToastInfo, hasSteps]);

    const onClick = () => {
        mutate();
        setIsRefreshTriggered(true);
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    return (
        <>
            <RefreshButton
                {...props}
                disabled={isLoading}
                icon={!isLoading && 'refresh'}
                onClick={onClick}
            >
                {isLoading ? (
                    <RefreshSpinnerButton>
                        <LoadingSpinner size={15} />
                        Refreshing dbt
                    </RefreshSpinnerButton>
                ) : (
                    'Refresh dbt'
                )}
            </RefreshButton>
            <RefreshStepsModal
                isOpen={isRefreshStepsOpen}
                onClose={setIsRefreshStepsOpen}
                statusData={statusInfo}
            />
        </>
    );
};

export default RefreshServerButton;
