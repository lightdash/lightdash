import { KeyCombo, useHotkeys } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { useCallback, useMemo } from 'react';
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
    const onClick = useCallback(async () => {
        remove();
        syncState(sorts.length === 0 ? defaultSort : undefined);
        track({
            name: EventName.RUN_QUERY_BUTTON_CLICKED,
        });
    }, [defaultSort, remove, sorts, syncState, track]);
    const hotkeys = useMemo(() => {
        const runQueryHotkey = {
            combo: 'ctrl+enter',
            group: 'Explorer',
            label: 'Run query',
            allowInInput: true,
            onKeyDown: onClick,
            global: true,
            preventDefault: true,
            stopPropagation: true,
        };
        return [
            runQueryHotkey,
            {
                ...runQueryHotkey,
                combo: 'cmd+enter',
            },
        ];
    }, [onClick]);
    useHotkeys(hotkeys);
    return (
        <Tooltip2 content={<KeyCombo combo="cmd+enter" />}>
            <BigButton
                intent="primary"
                style={{ width: 150, marginRight: '10px' }}
                onClick={onClick}
                disabled={!isValidQuery}
                loading={isFetching || status.data === 'loading'}
            >
                Run query
            </BigButton>
        </Tooltip2>
    );
};
