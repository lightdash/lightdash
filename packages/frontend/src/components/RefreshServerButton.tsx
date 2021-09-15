import { Button, Spinner } from '@blueprintjs/core';
import React, { ComponentProps, FC } from 'react';
import { useRefreshServer } from '../hooks/useRefreshServer';
import { useServerStatus } from '../hooks/useServerStatus';
import { EventName } from '../types/Events';
import { useTracking } from '../providers/TrackingProvider';

export const RefreshServerButton: FC<ComponentProps<typeof Button>> = (
    props,
) => {
    const refreshServer = useRefreshServer();
    const status = useServerStatus();
    const { track } = useTracking();

    const onClick = () => {
        refreshServer.mutate();
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    if (status.data === 'loading') {
        return (
            <Button {...props} disabled>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <Spinner size={15} />
                    <div style={{ paddingRight: '5px' }} />
                    Refreshing dbt
                </div>
            </Button>
        );
    }
    return (
        <Button {...props} icon="refresh" onClick={onClick}>
            Refresh dbt
        </Button>
    );
};
