import React, { ComponentProps, FC } from 'react';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { BigButton } from '../common/BigButton';
import { LoadingSpinner, RefreshDbt } from './RefreshDbtbutton.styles';

const RefreshDbtButton: FC<ComponentProps<typeof BigButton>> = (props) => {
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
        <RefreshDbt
            {...props}
            icon={!isLoading ? 'refresh' : <LoadingSpinner size={15} />}
            text={!isLoading ? 'Refresh dbt' : 'Refreshing dbt'}
            onClick={onClick}
        />
    );
};

export default RefreshDbtButton;
