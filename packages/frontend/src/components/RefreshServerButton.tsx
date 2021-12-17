import { Spinner } from '@blueprintjs/core';
import React, { ComponentProps, FC } from 'react';
import { useRefreshServer } from '../hooks/useRefreshServer';
import { useServerStatus } from '../hooks/useServerStatus';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { BigButton } from './common/BigButton';

export const RefreshServerButton: FC<ComponentProps<typeof BigButton>> = (
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
            <BigButton {...props} disabled style={{ width: 150 }}>
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'row',
                        whiteSpace: 'nowrap',
                    }}
                >
                    <Spinner size={15} />
                    <div style={{ paddingRight: '5px' }} />
                    Refreshing dbt
                </div>
            </BigButton>
        );
    }
    return (
        <BigButton
            {...props}
            icon="refresh"
            onClick={onClick}
            style={{ width: 150, whiteSpace: 'nowrap' }}
        >
            Refresh dbt
        </BigButton>
    );
};
