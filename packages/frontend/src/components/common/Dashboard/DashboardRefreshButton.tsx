import { ActionIcon, Button, Menu, Text, Tooltip } from '@mantine/core';
import { useInterval } from '@mantine/hooks';
import { IconCheck, IconChevronDown, IconRefresh } from '@tabler/icons-react';
import { type TFunction } from 'i18next';
import {
    memo,
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useDashboardRefresh } from '../../../hooks/dashboard/useDashboardRefresh';
import useToaster from '../../../hooks/toaster/useToaster';
import { useStableCallback } from '../../../hooks/useStableCallback';
import useDashboardTileStatusContext from '../../../providers/Dashboard/useDashboardTileStatusContext';
import MantineIcon from '../MantineIcon';

const getRefreshIntervalOptions = (t: TFunction<'modals'>) => [
    {
        value: '5',
        label: t('dashboard.refresh.minutesShort', { count: 5 }),
    },
    {
        value: '15',
        label: t('dashboard.refresh.minutesShort', { count: 15 }),
    },
    {
        value: '30',
        label: t('dashboard.refresh.minutesShort', { count: 30 }),
    },
    {
        value: '60',
        label: t('dashboard.refresh.hoursShort', { count: 1 }),
    },
    {
        value: '120',
        label: t('dashboard.refresh.hoursShort', { count: 2 }),
    },
];

type DashboardRefreshButtonProps = {
    onIntervalChange: (intervalMin?: number) => void;
    compact?: boolean;
    settingsOpened?: boolean;
    onSettingsClose?: () => void;
};

export const DashboardRefreshButton: FC<DashboardRefreshButtonProps> = memo(
    ({
        onIntervalChange,
        compact = false,
        settingsOpened = false,
        onSettingsClose,
    }) => {
        const { t } = useTranslation('modals');
        const refreshIntervalOptions = useMemo(
            () => getRefreshIntervalOptions(t),
            [t],
        );
        const { showToastSuccess } = useToaster();
        const [isOpen, setIsOpen] = useState(false);
        const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(
            null,
        );
        const [refreshInterval, setRefreshInterval] = useState<
            undefined | number
        >();
        const hasInterval = useMemo(
            () => Boolean(refreshInterval),
            [refreshInterval],
        );

        const {
            isFetching,
            invalidateDashboardRelatedQueries,
            invalidateDashboardResultsQueries,
            removeDashboardResultsQueries,
        } = useDashboardRefresh();

        const clearCacheAndFetch = useDashboardTileStatusContext(
            (c) => c.clearCacheAndFetch,
        );

        const setIsAutoRefresh = useDashboardTileStatusContext(
            (c) => c.setIsAutoRefresh,
        );
        const isOneAtLeastFetching = isFetching > 0;

        const invalidateAndSetRefreshTime = useCallback(async () => {
            // Remove old cached results before refreshing so stale data
            // doesn't persist when navigating away and back (SPA navigation).
            // Without this, old cache entries keyed with invalidateCache:false
            // survive and are served when DashboardProvider remounts.
            removeDashboardResultsQueries();
            clearCacheAndFetch();
            await invalidateDashboardRelatedQueries();
            await invalidateDashboardResultsQueries();

            setLastRefreshTime(new Date());
        }, [
            removeDashboardResultsQueries,
            clearCacheAndFetch,
            invalidateDashboardRelatedQueries,
            invalidateDashboardResultsQueries,
        ]);

        // The interval restarts whenever its callback identity changes, so
        // the tick must stay stable across re-renders.
        const tick = useStableCallback(() => {
            void invalidateAndSetRefreshTime();
        });
        const autoRefresh = useInterval(tick, (refreshInterval ?? 0) * 60_000);

        useEffect(() => {
            if (refreshInterval === undefined) return;
            autoRefresh.start();
            return autoRefresh.stop;
            // start/stop are stable; only the chosen interval matters
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [refreshInterval]);

        useEffect(() => {
            return () => {
                if (!hasInterval) return;
                onIntervalChange(undefined);
            };
        }, [hasInterval, onIntervalChange]);

        return (
            <ActionIcon.Group>
                {!compact && refreshInterval !== undefined ? (
                    <ActionIcon.GroupSection
                        variant="default"
                        size="md"
                        radius="md"
                    >
                        <Text span size="xs" c="foreground">
                            {t('dashboard.refresh.every', {
                                interval: refreshIntervalOptions.find(
                                    ({ value }) => refreshInterval === +value,
                                )?.label,
                            })}
                        </Text>
                    </ActionIcon.GroupSection>
                ) : null}
                {!compact && (
                    <Tooltip
                        position="bottom"
                        disabled={isOpen}
                        label={t('dashboard.refresh.lastRefreshedAt', {
                            time: lastRefreshTime
                                ? lastRefreshTime.toLocaleTimeString()
                                : t('dashboard.refresh.never'),
                        })}
                    >
                        <ActionIcon
                            aria-label={t('dashboard.refresh.refreshDashboard')}
                            size="md"
                            variant="default"
                            loading={isOneAtLeastFetching}
                            onClick={() => invalidateAndSetRefreshTime()}
                        >
                            <MantineIcon icon={IconRefresh} />
                        </ActionIcon>
                    </Tooltip>
                )}
                <Menu
                    withArrow
                    closeOnItemClick
                    closeOnClickOutside
                    opened={compact ? settingsOpened : isOpen}
                    onClose={compact ? onSettingsClose : () => setIsOpen(false)}
                >
                    <Menu.Target>
                        {compact ? (
                            <Button
                                variant="subtle"
                                aria-label={t(
                                    'dashboard.refresh.refreshDashboard',
                                )}
                                loading={isOneAtLeastFetching}
                                onClick={() =>
                                    void invalidateAndSetRefreshTime()
                                }
                                leftSection={<MantineIcon icon={IconRefresh} />}
                            >
                                {t('dashboard.refresh.refresh')}
                            </Button>
                        ) : (
                            <ActionIcon
                                aria-label={t(
                                    'dashboard.refresh.autoRefreshOptions',
                                )}
                                size="md"
                                variant="default"
                                disabled={isOneAtLeastFetching}
                                onClick={() => setIsOpen((prev) => !prev)}
                            >
                                <MantineIcon icon={IconChevronDown} />
                            </ActionIcon>
                        )}
                    </Menu.Target>
                    <Menu.Dropdown>
                        <Menu.Label>
                            {t('dashboard.refresh.autoRefreshWhileViewing')}
                        </Menu.Label>
                        <Menu.Item
                            fz="xs"
                            onClick={() => {
                                // A running interval restarts when its delay
                                // changes, so stop before the delay drops to 0.
                                autoRefresh.stop();
                                setRefreshInterval(undefined);
                                setIsAutoRefresh(false);
                            }}
                            disabled={refreshInterval === undefined}
                            rightSection={
                                refreshInterval === undefined ? (
                                    <MantineIcon icon={IconCheck} size="sm" />
                                ) : null
                            }
                        >
                            {t('dashboard.refresh.off')}
                        </Menu.Item>
                        {refreshIntervalOptions.map(({ value, label }) => (
                            <Menu.Item
                                fz="xs"
                                key={value}
                                onClick={() => {
                                    const valNum = +value;
                                    setRefreshInterval(valNum);
                                    onIntervalChange(valNum);
                                    setIsAutoRefresh(true);
                                    showToastSuccess({
                                        title: t(
                                            'dashboard.refresh.willRefreshEvery',
                                            { interval: label },
                                        ),
                                    });
                                }}
                                disabled={refreshInterval === +value}
                                rightSection={
                                    refreshInterval === +value ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size="sm"
                                        />
                                    ) : null
                                }
                            >
                                {label}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </ActionIcon.Group>
        );
    },
);
