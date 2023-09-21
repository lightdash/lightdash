import { Classes, KeyCombo } from '@blueprintjs/core';
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

    const canRunQuery = !isLoading && isValidQuery;

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
            content={<KeyCombo combo="mod+enter" />}
            position="bottom"
            disabled={isLoading || !isValidQuery}
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
