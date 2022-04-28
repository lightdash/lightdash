import React, { ComponentProps, FC, useEffect, useState } from 'react';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { BigButton } from '../common/BigButton';
import {
    LoadingSpinner,
    RefreshButton,
    RefreshSpinnerButton,
} from './RefreshServerButton.styles';

const RefreshServerButton: FC<ComponentProps<typeof BigButton>> = (props) => {
    const { setJobId, statusInfo } = useApp();
    const { data, mutate } = useRefreshServer();
    const [isRefreshTriggered, setIsRefreshTriggered] = useState(false);

    useEffect(() => {
        if (isRefreshTriggered && data) {
            setJobId(data?.jobUuid);
        }
    }, [setJobId, isRefreshTriggered, data]);

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
        </>
    );
};

export default RefreshServerButton;
