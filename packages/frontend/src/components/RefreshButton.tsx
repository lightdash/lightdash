import { FeatureFlags, type TimezoneSetting } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Kbd,
    Tooltip,
    type MantineSize,
} from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import { memo, useCallback, useTransition, type FC } from 'react';
import {
    explorerActions,
    selectIsValidQuery,
    selectPreAggVisible,
    selectQueryLimit,
    selectTimezone,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import { useMergeSetup } from '../features/mergeQuery/hooks/useMergeSetup';
import useHealth from '../hooks/health/useHealth';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import MantineIcon from './common/MantineIcon';
import PreAggregateStatusBadge from './PreAggregateStatusBadge';
import RunQuerySettings from './RunQuerySettings';

export const RefreshButton: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [, startTransition] = useTransition();
    const health = useHealth();
    const maxLimit = health.data?.query.maxLimit ?? 5000;

    const os = useOs();

    // Get state and actions from Redux
    const limit = useExplorerSelector(selectQueryLimit);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const dispatch = useExplorerDispatch();
    const preAggVisible = useExplorerSelector(selectPreAggVisible);
    const timezone = useExplorerSelector(selectTimezone);

    const { data: timezoneSupportFlag } = useServerFeatureFlag(
        FeatureFlags.EnableTimezoneSupport,
    );

    const setTimeZone = useCallback(
        (newTimezone: TimezoneSetting) => {
            dispatch(explorerActions.setTimeZone(newTimezone));
        },
        [dispatch],
    );

    // Get query state and actions from hooks
    const { isLoading, fetchResults, cancelQuery } = useExplorerQuery();

    const setRowLimit = useCallback(
        (newLimit: number) => {
            dispatch(explorerActions.setRowLimit(newLimit));
        },
        [dispatch],
    );

    // A configured merge is what the explorer runs, so this is the control that
    // runs it. Two run buttons for one result is how you end up with a chart
    // showing the answer to a question nobody asked.
    const merge = useMergeSetup();
    const canRunQuery = merge.isMerging ? merge.canRun : isValidQuery;
    // A merge blocks the run for a reason it can name; a silently disabled
    // button makes the user hunt the sidebar for it.
    const mergeBlockedReason =
        merge.isMerging && !merge.canRun ? merge.blockingReason : null;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (!canRunQuery) return;
        if (merge.isMerging) {
            merge.handleRun();
        } else {
            fetchResults();
        }
        track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
    }, [fetchResults, track, canRunQuery, merge]);

    useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

    const isRunning = isLoading || !!merge.isRunning;

    return (
        <Box pos="relative">
            <Button.Group>
                <Tooltip
                    label={
                        mergeBlockedReason ?? (
                            <Group gap={4} wrap="nowrap">
                                <Kbd size="xs">
                                    {os === 'macos' || os === 'ios'
                                        ? '⌘'
                                        : 'Ctrl'}
                                </Kbd>
                                <Kbd size="xs">↵</Kbd>
                            </Group>
                        )
                    }
                    position="bottom"
                    disabled={
                        isRunning || (!canRunQuery && !mergeBlockedReason)
                    }
                >
                    <Button
                        size={size}
                        // data-disabled keeps the button hoverable so the
                        // tooltip can say why the merge cannot run yet.
                        disabled={!canRunQuery && !mergeBlockedReason}
                        data-disabled={mergeBlockedReason ? true : undefined}
                        aria-disabled={mergeBlockedReason ? true : undefined}
                        leftSection={<MantineIcon icon={IconPlayerPlay} />}
                        loading={isRunning}
                        onClick={onClick}
                        data-testid="RefreshButton/RunQueryButton"
                    >
                        Run query
                    </Button>
                </Tooltip>

                <RunQuerySettings
                    disabled={!canRunQuery}
                    size={size}
                    maxLimit={maxLimit}
                    limit={limit}
                    onLimitChange={setRowLimit}
                    showAutoFetchSetting
                    showPreAggregateSetting={preAggVisible}
                    showTimezoneSetting={timezoneSupportFlag?.enabled ?? false}
                    timezone={timezone ?? undefined}
                    onTimezoneChange={setTimeZone}
                    isQueryRunning={isLoading}
                    onCancelQuery={() =>
                        startTransition(() => {
                            cancelQuery();
                        })
                    }
                />
            </Button.Group>
            <PreAggregateStatusBadge />
        </Box>
    );
});
