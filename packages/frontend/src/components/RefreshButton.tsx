import { type TimezoneSetting } from '@lightdash/common';
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
                        // Anchor for scope walkthroughs (data-tour-via), and
                        // the action of the manage:Explore walkthrough: a
                        // query of one's own is what the scope unlocks.
                        // See scripts/scope-tours.
                        data-tour-anchor="run-query"
                        data-tour-hint="Run the query"
                        data-tour-scope="manage:Explore"
                        data-tour-step="2"
                        data-tour-route="/projects/:projectUuid/tables/:tableName"
                        data-tour-label="Run the query"
                        data-tour-title="Explore data"
                        data-tour-interactive="true"
                        data-tour-via='[data-tour-nav="new"] >> [data-tour-nav="new-chart"] >> [data-tour-anchor="explore-table"] >> [data-tour-anchor="explore-metric"] >> [data-tour-anchor="explore-dimension"]'
                        data-tour-docs="explore/explore-view.mdx#select-your-fields:li3"
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
                    showTimezoneSetting
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
