import { HotkeyConfig, KeyCombo, useHotkeys } from '@blueprintjs/core';
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

    const hotkeys = useMemo<HotkeyConfig[]>(() => {
        const runQueryHotkey: Omit<HotkeyConfig, 'combo'> = {
            group: 'Explorer',
            label: 'Run query',
            allowInInput: true,
            onKeyDown: onClick,
            global: true,
            preventDefault: true,
            stopPropagation: true,
            disabled: !hasUnfetchedChanges,
        };
        return [
            { ...runQueryHotkey, combo: 'ctrl+enter' },
            { ...runQueryHotkey, combo: 'cmd+enter' },
        ];
    }, [onClick, hasUnfetchedChanges]);

    useHotkeys(hotkeys);

    return (
        <Tooltip2
            content={<KeyCombo combo="cmd+enter" />}
            position="bottom"
            disabled={isLoading || !isValidQuery || !hasUnfetchedChanges}
        >
            <BigButton
                icon="play"
                intent="primary"
                style={{ width: 150 }}
                onClick={onClick}
                disabled={!isValidQuery || !hasUnfetchedChanges}
                loading={isLoading}
            >
                Run query
            </BigButton>
        </Tooltip2>
    );
});
