import { Button, Group, Kbd, Text, Tooltip } from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconPlayerPlayFilled } from '@tabler/icons-react';
import { memo, useCallback } from 'react';
import { useExplorerContext } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';

export const RefreshButton = memo(() => {
    const os = useOs();
    const isValidQuery = useExplorerContext(
        (context) => context.state.isValidQuery,
    );
    const isLoading = useExplorerContext(
        (context) => context.queryResults.isLoading,
    );
    const fetchResults = useExplorerContext(
        (context) => context.actions.fetchResults,
    );

    const canRunQuery = !isLoading && isValidQuery;

    const { track } = useTracking();

    const onClick = useCallback(() => {
        if (canRunQuery) {
            fetchResults();
            track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
        }
    }, [fetchResults, track, canRunQuery]);

    useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

    return (
        <Tooltip
            label={
                <Group spacing="xxs">
                    <Kbd
                        fw={600}
                        sx={{
                            backgroundColor: '#2C2E33',
                            color: '#C1C2C5',
                            border: 'none',
                        }}
                    >
                        {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                    </Kbd>

                    <Text color="dimmed" fw={600}>
                        +
                    </Text>

                    <Kbd
                        fw={600}
                        sx={{
                            backgroundColor: '#2C2E33',
                            color: '#C1C2C5',
                            border: 'none',
                        }}
                    >
                        enter
                    </Kbd>
                </Group>
            }
            position="bottom"
            withArrow
            disabled={isLoading || !isValidQuery}
            sx={{ padding: '10px' }}
        >
            <Button
                leftIcon={<IconPlayerPlayFilled size="1rem" />}
                loading={isLoading}
                onClick={onClick}
                sx={{
                    '&[data-disabled]': { pointerEvents: 'all' },
                    width: 150,
                }}
                disabled={!isLoading && !canRunQuery}
            >
                Run query
            </Button>
        </Tooltip>
    );
});
