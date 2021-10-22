import React from 'react';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { useQueryResults } from '../hooks/useQueryResults';
import useDefaultSortField from '../hooks/useDefaultSortField';
import { BigButton } from './common/BigButton';

export const RefreshButton = () => {
    const {
        state: { isValidQuery, sorts },
        actions: { syncState },
    } = useExplorer();
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
            loading={isFetching}
        >
            Run query
        </BigButton>
    );
};
