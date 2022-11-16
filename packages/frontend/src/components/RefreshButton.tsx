import { Classes, HotkeyConfig, KeyCombo, useHotkeys } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { memo, useCallback, useMemo } from 'react';
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

    const { track } = useTracking();

    const onClick = useCallback(() => {
        fetchResults();
        track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
    }, [fetchResults, track]);

    const isButtonDisabled = isLoading || !isValidQuery || !hasUnfetchedChanges;

    const hotkeys = useMemo<HotkeyConfig[]>(
        () => [
            {
                combo: 'mod+enter',
                group: 'Explorer',
                label: 'Run query',
                allowInInput: true,
                onKeyDown: onClick,
                global: true,
                preventDefault: true,
                stopPropagation: true,
                disabled: isButtonDisabled,
            },
        ],
        [onClick, isButtonDisabled],
    );

    useHotkeys(hotkeys);

    return (
        <Tooltip2
            content={
                !hasUnfetchedChanges ? (
                    'You need to make some changes before running a query'
                ) : (
                    <KeyCombo combo="mod+enter" />
                )
            }
            position="bottom"
            disabled={isLoading || !isValidQuery}
        >
            <BigButton
                style={{ width: 150 }}
                icon="play"
                intent="primary"
                loading={isLoading}
                // disabled button captures hover events
                onClick={isButtonDisabled ? undefined : onClick}
                className={isButtonDisabled ? Classes.DISABLED : undefined}
            >
                Run query
            </BigButton>
        </Tooltip2>
    );
});
