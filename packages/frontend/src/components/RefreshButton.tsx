import { Classes } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { useHotkeys } from '@mantine/hooks';
import { memo, useCallback } from 'react';
import { useExplorerContext } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { BigButton } from './common/BigButton';

export const RefreshButton = memo(() => {
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const isLoading = useExplorerContext(
        (context) => context.queryResults.isLoading,
    );
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );
    const hasUnfetchedChanges = useExplorerContext(
        (context) => context.hasUnfetchedChanges,
    );

    const canRunQuery = !isLoading && isValidQuery && hasUnfetchedChanges;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (canRunQuery) {
            fetchResults();
            track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
        }
    }, [fetchResults, track, canRunQuery]);

    useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

    return (
        <Tooltip2
            content={
                !hasUnfetchedChanges
                    ? 'You need to make some changes before running a query'
                    : ''
            }
            position="bottom"
            disabled={hasUnfetchedChanges}
        >
            <BigButton
                style={{ width: 150 }}
                icon="play"
                intent="primary"
                loading={isLoading}
                // disabled button captures hover events
                onClick={onClick}
                className={!canRunQuery ? Classes.DISABLED : undefined}
            >
                Run query
            </BigButton>
        </Tooltip2>
    );
});
