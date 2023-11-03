import { Button, Popover, Radio, Select, Stack, Text } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';
import { useFeatureFlagEnabled } from 'posthog-js/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDashboardRefresh } from '../../../hooks/dashboard/useDashboardRefresh';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import MantineIcon from '../MantineIcon';

const REFRESH_INTERVAL_OPTIONS = [
    {
        value: '1',
        label: 'Every 1 minute',
    },
    {
        value: '2',
        label: 'Every 2 minutes',
    },
    {
        value: '5',
        label: 'Every 5 minutes',
    },
    {
        value: '10',
        label: 'Every 10 minutes',
    },
    {
        value: '15',
        label: 'Every 15 minutes',
    },
    {
        value: '30',
        label: 'Every 30 minutes',
    },
    {
        value: '60',
        label: 'Every 60 minutes',
    },
];

const DashboardRefreshButtonWithAutoRefresh = () => {
    const form = useForm({
        initialValues: {
            refreshInterval: REFRESH_INTERVAL_OPTIONS[0].value,
            type: 'manual',
        },
    });
    const intervalIdRef = useRef<NodeJS.Timeout | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
    const [refreshInterval, setRefreshInterval] = useState<
        undefined | number
    >();

    const { isFetching, invalidateDashboardRelatedQueries } =
        useDashboardRefresh();
    const { clearCacheAndFetch } = useDashboardContext();

    const isOneAtLeastFetching = isFetching > 0;

    const invalidateAndSetRefreshTime = useCallback(() => {
        clearCacheAndFetch();
        invalidateDashboardRelatedQueries();
        setLastRefreshTime(new Date());
    }, [clearCacheAndFetch, invalidateDashboardRelatedQueries]);

    useEffect(() => {
        // Clear existing interval when refreshInterval changes or on unmount
        const clearExistingInterval = () => {
            if (intervalIdRef.current) {
                clearInterval(intervalIdRef.current);
                intervalIdRef.current = null;
            }
        };

        if (refreshInterval !== undefined) {
            intervalIdRef.current = setInterval(() => {
                invalidateAndSetRefreshTime();
            }, refreshInterval * 1000 * 60);
        }

        return clearExistingInterval;
    }, [invalidateAndSetRefreshTime, refreshInterval]);

    const handleSubmit = form.onSubmit((values) => {
        if (values.type === 'auto') {
            setRefreshInterval(+values.refreshInterval);
        } else {
            setRefreshInterval(undefined);
        }
    });

    return (
        <Button.Group>
            <Button
                size="xs"
                h={28}
                miw="sm"
                variant="default"
                loading={isOneAtLeastFetching}
                loaderPosition="center"
                onClick={() => {
                    if (intervalIdRef && refreshInterval) {
                        setIsOpen(true);
                    } else {
                        invalidateAndSetRefreshTime();
                    }
                }}
            >
                {intervalIdRef && refreshInterval ? (
                    <Text
                        span
                        mr="xs"
                        c={isOneAtLeastFetching ? 'transparent' : 'gray'}
                    >
                        {
                            REFRESH_INTERVAL_OPTIONS.find(
                                ({ value }) => refreshInterval === +value,
                            )?.label
                        }
                    </Text>
                ) : null}
                <MantineIcon
                    icon={IconRefresh}
                    color={isOneAtLeastFetching ? 'transparent' : 'black'}
                />
            </Button>
            <Popover withinPortal withArrow opened={isOpen}>
                <Popover.Target>
                    <Button
                        size="xs"
                        variant="default"
                        h={28}
                        w="md"
                        disabled={isOneAtLeastFetching}
                        p={0}
                        onClick={() => setIsOpen((prev) => !prev)}
                    >
                        <MantineIcon size="sm" icon={IconChevronDown} />
                    </Button>
                </Popover.Target>
                <Popover.Dropdown fz="xs" miw={250}>
                    <Stack>
                        <Text fw={500} color="gray.6">
                            Last refreshed at:{' '}
                            {lastRefreshTime
                                ? lastRefreshTime.toLocaleTimeString()
                                : 'Never'}
                        </Text>

                        <form onSubmit={handleSubmit}>
                            <Stack spacing="xs">
                                <Radio.Group
                                    label="Refresh frequency"
                                    size="xs"
                                    {...form.getInputProps('type')}
                                >
                                    <Stack spacing="xxs" pt="xs">
                                        <Radio label="Manual" value="manual" />
                                        <Radio label="Auto" value="auto" />
                                    </Stack>
                                </Radio.Group>
                                {form.values.type === 'auto' && (
                                    <Select
                                        size="xs"
                                        defaultValue={
                                            REFRESH_INTERVAL_OPTIONS[0].value
                                        }
                                        data={REFRESH_INTERVAL_OPTIONS}
                                        onChange={(value) =>
                                            value &&
                                            form.setFieldValue(
                                                'refreshInterval',
                                                value,
                                            )
                                        }
                                    />
                                )}

                                <Button
                                    type="submit"
                                    size="xs"
                                    onClick={() => {
                                        setIsOpen(false);
                                    }}
                                >
                                    Confirm
                                </Button>
                            </Stack>
                        </form>
                    </Stack>
                </Popover.Dropdown>
            </Popover>
        </Button.Group>
    );
};

const DashboardRefreshButtonWithoutAutoRefresh = () => {
    const { isFetching, invalidateDashboardRelatedQueries } =
        useDashboardRefresh();
    const { clearCacheAndFetch } = useDashboardContext();

    const isOneAtLeastFetching = isFetching > 0;

    return (
        <Button
            size="xs"
            loading={isOneAtLeastFetching}
            leftIcon={<MantineIcon icon={IconRefresh} />}
            onClick={() => {
                clearCacheAndFetch();
                invalidateDashboardRelatedQueries();
            }}
        >
            Refresh
        </Button>
    );
};

export const DashboardRefreshButton = () => {
    const isAutoRefreshFeatureEnabled = useFeatureFlagEnabled(
        'dashboard-auto-refresh',
    );

    if (isAutoRefreshFeatureEnabled) {
        return <DashboardRefreshButtonWithAutoRefresh />;
    }

    return <DashboardRefreshButtonWithoutAutoRefresh />;
};
