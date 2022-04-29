import React, { ComponentProps, FC } from 'react';
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
    const { activeJob } = useApp();
    const { mutate } = useRefreshServer();
    const isLoading = activeJob && activeJob?.jobStatus === 'RUNNING';

    const { track } = useTracking();

    const onClick = () => {
        mutate();
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
