import {
    Button,
    Group,
    Kbd,
    Text,
    Tooltip,
    rgba,
    type MantineSize,
} from '@mantine-8/core';
import { useHotkeys, useOs } from '@mantine-8/hooks';
import { IconPlayerPlay, IconX } from '@tabler/icons-react';
import { memo, useCallback, useTransition, type FC } from 'react';
import {
    explorerActions,
    selectIsValidQuery,
    selectQueryLimit,
    useExplorerDispatch,
    useExplorerSelector,
} from '../features/explorer/store';
import useHealth from '../hooks/health/useHealth';
import { useExplorerQuery } from '../hooks/useExplorerQuery';
import useTracking from '../providers/Tracking/useTracking';
import { EventName } from '../types/Events';
import RunQuerySettings from './RunQuerySettings';
import MantineIcon from './common/MantineIcon';

export const RefreshButton: FC<{ size?: MantineSize }> = memo(({ size }) => {
    const [, startTransition] = useTransition();
    const health = useHealth();
    const maxLimit = health.data?.query.maxLimit ?? 5000;

    const os = useOs();

    // Get state and actions from Redux
    const limit = useExplorerSelector(selectQueryLimit);
    const isValidQuery = useExplorerSelector(selectIsValidQuery);
    const dispatch = useExplorerDispatch();

    // Get query state and actions from hooks
    const { isLoading, fetchResults, cancelQuery } = useExplorerQuery();

    const setRowLimit = useCallback(
        (newLimit: number) => {
            dispatch(explorerActions.setRowLimit(newLimit));
        },
        [dispatch],
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
                            ? `1px solid ${rgba(theme.colors.ldGray[5], 0.6)}`
                            : undefined,
                        borderTopRightRadius: 0,
                        borderBottomRightRadius: 0,
                    })}
                    data-testid="RefreshButton/RunQueryButton"
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
    );
});
