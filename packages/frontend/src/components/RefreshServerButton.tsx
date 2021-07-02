import { Button, Spinner } from '@blueprintjs/core';
import React from 'react';
import { useRefreshServer } from '../hooks/useRefreshServer';
import { useServerStatus } from '../hooks/useServerStatus';

export const RefreshServerButton = () => {
    const refreshServer = useRefreshServer();
    const status = useServerStatus();

    const onClick = () => {
        refreshServer.mutate();
    };

    if (status.data === 'loading') {
        return (
            <Button disabled>
                <div style={{ display: 'flex', flexDirection: 'row' }}>
                    <Spinner size={15} />
                    <div style={{ paddingRight: '5px' }} />
                    Refreshing dbt
                </div>
            </Button>
        );
    }
    return (
        <Button icon="refresh" onClick={onClick}>
            Refresh dbt
        </Button>
    );
};
