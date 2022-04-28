import React, { ComponentProps, FC, useState } from 'react';
import {
    useGetRefreshData,
    useRefreshServer,
} from '../../hooks/useRefreshServer';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
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
