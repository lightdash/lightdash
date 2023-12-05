import {
    ActionIcon,
    Button,
    Group,
    Kbd,
    MantineProvider,
    MantineSize,
    Text,
    Tooltip,
} from '@mantine/core';
import { useHotkeys, useOs } from '@mantine/hooks';
import { IconPlayerPlay } from '@tabler/icons-react';
import React, { FC, memo, useCallback } from 'react';
import { useExplorerContext } from '../providers/ExplorerProvider';
import { useTracking } from '../providers/TrackingProvider';
import { EventName } from '../types/Events';
import MantineIcon from './common/MantineIcon';
import LimitButton from './LimitButton';

const KeyboardShortcut = () => {
    const os = useOs();
    return (
        <MantineProvider inherit theme={{ colorScheme: 'dark' }}>
            <Group spacing="xxs">
                <Kbd fw={600}>
                    {os === 'macos' || os === 'ios' ? '⌘' : 'ctrl'}
                </Kbd>

                <Text fw={600}>+</Text>

                <Kbd fw={600}>Enter</Kbd>
            </Group>
        </MantineProvider>
    );
};

export const RefreshButton: FC<{ size?: MantineSize; minimal?: boolean }> =
    memo(({ size, minimal = false }) => {
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

        const canRunQuery = isValidQuery;

        const { track } = useTracking();

        const onClick = useCallback(() => {
            if (canRunQuery) {
                fetchResults();
                track({ name: EventName.RUN_QUERY_BUTTON_CLICKED });
            }
        }, [fetchResults, track, canRunQuery]);

        useHotkeys([['mod + enter', onClick, { preventDefault: true }]]);

        if (minimal) {
            return (
                <Tooltip
                    label={<KeyboardShortcut />}
                    position="bottom"
                    withArrow
                    withinPortal
                    disabled={isLoading || !isValidQuery}
                >
                    <ActionIcon
                        variant="filled"
                        loading={isLoading}
                        disabled={!isValidQuery}
                        onClick={onClick}
                        color={'blue'}
                    >
                        <MantineIcon icon={IconPlayerPlay} />
                    </ActionIcon>
                </Tooltip>
            );
        }

        return (
            <Button.Group>
                <Tooltip
                    label={<KeyboardShortcut />}
                    position="bottom"
                    withArrow
                    withinPortal
                    disabled={isLoading || !isValidQuery}
                >
                    <Button
                        size={size}
                        disabled={!isValidQuery}
                        loading={isLoading}
                        onClick={onClick}
                        sx={{ flex: 1 }}
                    >
                        Run query ({limit})
                    </Button>
                </Tooltip>
                <LimitButton
                    disabled={!isValidQuery}
                    size={size}
                    limit={limit}
                    onLimitChange={setRowLimit}
                />
            </Button.Group>
        );
    });
