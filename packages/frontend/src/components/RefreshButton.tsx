import {
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
    type MantineSize,
} from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { memo, useCallback, useEffect, useRef, type FC } from 'react';
import useHealth from '../hooks/health/useHealth';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import LimitButton from './LimitButton';
import MantineIcon from './common/MantineIcon';

export const RefreshButton: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const health = useHealth();
    const maxLimit = health.data?.query.maxLimit ?? 5000;

    const os = useOs();
    const limit = useExplorerContext(
        (context) => context.state.unsavedChartVersion.metricQuery.limit,
    );
    const setRowLimit = useExplorerContext(
        (context) => context.actions.setRowLimit,
    );
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const isLoading = useExplorerContext(
        (context) => context.queryResults.isLoading,
    );
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );
    const cancelFetchResults = useExplorerContext(
        (context) => context.actions.cancelFetchResults,
    );
    const shouldFetchResults = useExplorerContext(
        (context) => context.state.shouldFetchResults,
    );

    // Reference to track if this is the initial page load query
    const initialLoadRef = useRef(true);
    // Track if a user-initiated query has ever been run
    const userInitiatedQueryRef = useRef(false);
    // Track whether the current query is the initial automatic one
    const isInitialLoadQuery = useRef(false);

    useEffect(() => {
        /*
        There's a need to distinguish between the initial load query and a user-initiated query.
        The initial load query has two cases:
        <- When the page reloads or is refreshed ->
          We don’t want to show the cancel button because it's weird for the user to see a 'Cancel query' button
          when they didn’t initiate the query. Plus, the user will most likely want to continue from where they left off
          when the page reloads. Displaying the query results on page load complements this scenario.

        <- When the user navigates from another page ->
          For example, from `/projects/:projectUuid/tables`, where they select which table to explore.
          Upon navigating to the explore page, the metric query is empty, so no results are displayed initially,
          and the user must manually trigger the "Run query" button.
          This case requires a manual trigger at the end of it, so it makes sense to categorize it as a 'user-initiated' query. 

        <- shouldFetchResults and isLoading do not appropriately track this second case hence the need for the ref trackers ->
        */

        if (initialLoadRef.current && shouldFetchResults && isLoading) {
            isInitialLoadQuery.current = true;
            initialLoadRef.current = false; // No longer initial load after first query
        } else if (isLoading) {
            // If we're loading but it's not the initial fetch, it must be user-triggered
            isInitialLoadQuery.current = false;
            userInitiatedQueryRef.current = true;
        }
    }, [isLoading, shouldFetchResults]);

    const canRunQuery = isValidQuery;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (canRunQuery) {
            fetchResults();
            userInitiatedQueryRef.current = true;
            isInitialLoadQuery.current = false;
            track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
        }
    }, [fetchResults, track, canRunQuery]);

    useHotkeys([
        ['mod + enter', onClick, { preventDefault: true }],
        [
            'esc',
            () => {
                if (
                    isLoading &&
                    (!isInitialLoadQuery.current ||
                        userInitiatedQueryRef.current)
                ) {
                    cancelFetchResults();
                }
            },
            { preventDefault: true },
        ],
    ]);

    // We only want to show the cancel button if:
    // 1. It's loading AND
    // 2. Either this is not the initial load query OR user has previously initiated a query
    if (
        isLoading &&
        (!isInitialLoadQuery.current || userInitiatedQueryRef.current)
    ) {
        return (
            <Tooltip
                label={
                    <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                        <Kbd fw={600}>esc</Kbd>
                    </MantineProvider>
                }
                position="bottom"
                withArrow
                withinPortal
            >
                <Button
                    size={size}
                    leftIcon={<MantineIcon icon={IconX} />}
                    onClick={cancelFetchResults}
                    variant="outline"
                    color="red"
                >
                    Cancel query
                </Button>
            </Tooltip>
        );
    }

    return (
        <Button.Group>
            <Tooltip
                label={
                    <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
                        <Group spacing="xxs">
                            <Kbd fw={600}>
                                {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                            </Kbd>

                            <Text fw={600}>+</Text>

                            <Kbd fw={600}>Enter</Kbd>
                        </Group>
                    </MantineProvider>
                }
                position="bottom"
                withArrow
                withinPortal
                disabled={isLoading || !isValidQuery}
            >
                <Button
                    pr="xxs"
                    size={size}
                    disabled={!isValidQuery}
                    leftIcon={<MantineIcon icon={IconPlayerPlay} />}
                    loading={
                        isLoading &&
                        isInitialLoadQuery.current &&
                        !userInitiatedQueryRef.current
                    }
                    onClick={onClick}
                    sx={(theme) => ({
                        flex: 1,
                        borderRight: `1px solid ${theme.fn.rgba(
                            theme.colors.gray[5],
                            0.6,
                        )}`,
                    })}
                >
                    Run query ({limit})
                </Button>
            </Tooltip>

            <LimitButton
                disabled={isLoading || !isValidQuery}
                size={size}
                maxLimit={maxLimit}
                limit={limit}
                onLimitChange={setRowLimit}
            />
        </Button.Group>
    );
});
