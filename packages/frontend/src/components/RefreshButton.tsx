import { Button } from '@blueprintjs/core';
import React from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { useQueryResults } from '../hooks/useQueryResults';

export const RefreshButton = () => {
    const {
        state: { isValidQuery },
        actions: { syncState },
    } = useExplorer();
    const { isFetching, remove } = useQueryResults();
    const { track } = useTracking();
    return (
        <Button
            intent="primary"
            style={{ height: '40px', width: 150, marginRight: '10px' }}
            onClick={async () => {
                remove();
                syncState();
                track({
                    name: EventName.RUN_QUERY_BUTTON_CLICKED,
                });
            }}
            disabled={!isValidQuery}
            loading={isFetching}
        >
            Run query
        </Button>
    );
};
