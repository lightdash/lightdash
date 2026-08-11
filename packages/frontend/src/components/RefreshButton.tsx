import { FeatureFlags, type TimezoneSetting } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Kbd,
    rgba,
    Text,
    Tooltip,
    type MantineSize,
} from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
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
import { MergeToggleButton } from '../features/mergeQuery/components/MergeToggleButton';
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

    return (
        <Box pos="relative">
            <Button.Group>
                {/* Attached to Run rather than sitting beside it: turning a
                    merge on changes what Run does, so it reads as one control
                    with a mode instead of two buttons that happen to be near
                    each other. */}
                <MergeToggleButton size={size} />

                <Tooltip
                    label={
                        <Group gap="xxs">
                            <Kbd fw={600}>
                                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                            </Kbd>

                            <Text fw={600}>+</Text>

                            <Kbd fw={600}>Enter</Kbd>
                        </Group>
                    }
                    position="bottom"
                    withArrow
                    withinPortal
                    disabled={isLoading || !canRunQuery}
                >
                    <Button
                        size={size}
                        pr={limit ? 'xs' : undefined}
                        disabled={!canRunQuery}
                        leftSection={<MantineIcon icon={IconPlayerPlay} />}
                        loading={isLoading || !!merge.isRunning}
                        onClick={onClick}
                        style={(theme) => ({
                            flex: 1,
                            borderRight: canRunQuery
                                ? `1px solid ${rgba(theme.colors.ldGray[5], 0.6)}`
                                : undefined,
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                        })}
                        data-testid="RefreshButton/RunQueryButton"
                    >
                        {merge.isMerging ? 'Run merge' : `Run query (${limit})`}
                    </Button>
                </Tooltip>

                {isLoading ? (
                    <Tooltip
                        label={'Cancel query'}
                        position="bottom"
                        withArrow
                        withinPortal
                    >
                        <Button
                            size={size}
                            p="xs"
                            onClick={() =>
                                startTransition(() => {
                                    cancelQuery();
                                })
                            }
                            style={{
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                            }}
                        >
                            <MantineIcon icon={IconX} size="sm" />
                        </Button>
                    </Tooltip>
                ) : (
                    <RunQuerySettings
                        disabled={!isValidQuery}
                        size={size}
                        maxLimit={maxLimit}
                        limit={limit}
                        onLimitChange={setRowLimit}
                        showAutoFetchSetting
                        showPreAggregateSetting={preAggVisible}
                        showTimezoneSetting={
                            timezoneSupportFlag?.enabled ?? false
                        }
                        timezone={timezone ?? undefined}
                        onTimezoneChange={setTimeZone}
                        targetProps={{
                            style: {
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                            },
                        }}
                    />
                )}
            </Button.Group>
            <PreAggregateStatusBadge />
        </Box>
    );
});
