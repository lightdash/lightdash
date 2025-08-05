import {
    Button,
    Group,
    Kbd,
    MantineProvider,
    Text,
    Tooltip,
    rgba,
    type MantineSize,
} from '@mantine-8/core';
import { useHotkeys, useOs } from '@mantine-8/hooks';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { memo, useCallback, useTransition, type FC } from 'react';
import useHealth from '../hooks/health/useHealth';
import { getMantine8ThemeOverride } from '../mantine8Theme';
import useExplorerContext from '../providers/Explorer/useExplorerContext';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import RunQuerySettings from './RunQuerySettings';
import MantineIcon from './common/MantineIcon';

export const RefreshButton: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [, startTransition] = useTransition();
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
    const isLoading = useExplorerContext((context) => {
        const isCreatingQuery = context.query.isFetching;
        const isFetchingFirstPage = context.queryResults.isFetchingFirstPage;
        const isFetchingAllRows = context.queryResults.isFetchingAllPages;
        const isQueryError = context.queryResults.error;
        return (
            (isCreatingQuery || isFetchingFirstPage || isFetchingAllRows) &&
            !isQueryError
        );
    });
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );
    const cancelQuery = useExplorerContext(
        (context) => context.actions.cancelQuery,
    );

    const canRunQuery = isValidQuery;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (canRunQuery) {
            fetchResults();
            track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
        }
    }, [fetchResults, track, canRunQuery]);

    useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

    return (
        <MantineProvider theme={getMantine8ThemeOverride()}>
            <Button.Group>
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
                    disabled={isLoading || !isValidQuery}
                >
                    <Button
                        size={size}
                        pr={limit ? 'xs' : undefined}
                        disabled={!isValidQuery}
                        leftSection={<MantineIcon icon={IconPlayerPlay} />}
                        loading={isLoading}
                        onClick={onClick}
                        style={(theme) => ({
                            flex: 1,
                            borderRight: isValidQuery
                                ? `1px solid ${rgba(theme.colors.gray[5], 0.6)}`
                                : undefined,
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                        })}
                    >
                        Run query ({limit})
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
                        targetProps={{
                            style: {
                                borderTopLeftRadius: 0,
                                borderBottomLeftRadius: 0,
                            },
                        }}
                    />
                )}
            </Button.Group>
        </MantineProvider>
    );
});
