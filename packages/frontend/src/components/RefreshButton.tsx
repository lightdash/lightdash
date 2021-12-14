import React from 'react';
import useDefaultSortField from '../hooks/useDefaultSortField';
import { useQueryResults } from '../hooks/useQueryResults';
import { useServerStatus } from '../hooks/useServerStatus';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { BigButton } from './common/BigButton';

export const RefreshButton = () => {
    const {
        state: { isValidQuery, sorts },
        actions: { syncState },
    } = useExplorer();
    const status = useServerStatus();
    const { isFetching, remove } = useQueryResults();
    const { track } = useTracking();
    const defaultSort = useDefaultSortField();
    return (
        <BigButton
            intent="primary"
            style={{ width: 150, marginRight: '10px' }}
            onClick={async () => {
                remove();
                syncState(sorts.length === 0 ? defaultSort : undefined);
                track({
                    name: EventName.RUN_QUERY_BUTTON_CLICKED,
                });
            }}
            disabled={!isValidQuery}
            loading={isFetching || status.data === 'loading'}
        >
            Run query
        </BigButton>
    );
};
