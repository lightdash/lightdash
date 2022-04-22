import { KeyCombo, useHotkeys } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import React, { useCallback, useMemo } from 'react';
import useDefaultSortField from '../hooks/useDefaultSortField';
import { useExplorer } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import { BigButton } from './common/BigButton';

export const RefreshButton = () => {
    const {
        state: { isValidQuery, sorts },
        queryResults: { mutate, isLoading: isLoadingResults },
        actions: { setSortFields },
    } = useExplorer();
    const { track } = useTracking();
    const defaultSort = useDefaultSortField();
    const isDisabled = !isValidQuery;
    const onClick = useCallback(async () => {
        if (sorts.length <= 0 && defaultSort) {
            setSortFields([defaultSort]);
        } else {
            mutate();
        }

        track({
            name: EventName.RUN_QUERY_BUTTON_CLICKED,
        });
    }, [defaultSort, mutate, setSortFields, sorts, track]);
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
        <Tooltip2
            content={<KeyCombo combo="cmd+enter" />}
            position="bottom"
            disabled={isDisabled || isLoadingResults}
        >
            <BigButton
                intent="primary"
                style={{ width: 150, marginRight: '10px' }}
                onClick={onClick}
                disabled={isDisabled}
                loading={isLoadingResults}
            >
                Run query
            </BigButton>
        </Tooltip2>
    );
};
