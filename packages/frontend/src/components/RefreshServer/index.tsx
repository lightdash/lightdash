import React, { ComponentProps, FC, useState } from 'react';
import {
    useGetRefreshData,
    useRefreshServer,
} from '../../hooks/useRefreshServer';
import { useServerStatus } from '../../hooks/useServerStatus';
import { useApp } from '../../providers/AppProvider';
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
    const status = useServerStatus();
    const isLoading = status.data === 'loading';
    const { data: statusInfo } = useGetRefreshData(data?.jobUuid);
    const { track } = useTracking();
    const { showToastInfo } = useApp();

    const onClick = () => {
        mutate();
        showToastInfo({
            title: `Sync in progress  Step 1/5: Cloning dbt project from Github`,
            icon: 'refresh',
            action: {
                text: 'View log ',
                icon: 'arrow-right',
                onClick: () => setIsRefreshStepsOpen(true),
            },
        });
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
