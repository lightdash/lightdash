import { FeatureFlags } from '@lightdash/common';
import { Button, Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useRegistryChartTypes } from '../hooks/useRegistryChartTypes';
import { getChartTypeIcon } from '../utils/chartTypeIcons';
import ChartTypeLibraryCard from './ChartTypeLibraryCard';
import ChartTypeLibraryDetailModal from './ChartTypeLibraryDetailModal';

type Props = {
    projectUuid: string;
    withHeader?: boolean;
    onShowInstalled?: (appUuid: string) => void;
    /** Called after a successful install with the installed app's uuid. */
    onInstalled?: (appUuid: string) => void;
};

/**
 * Installable chart types from the configured chart registry, shown as a
 * section alongside the project's own chart types. Silent by default: no
 * flag, a disabled registry, or an org that hasn't configured one all render
 * nothing rather than an empty section nobody asked for.
 */
const ChartTypeLibrarySection: FC<Props> = ({
    projectUuid,
    withHeader = true,
    onShowInstalled,
    onInstalled,
}) => {
    const flagQuery = useServerFeatureFlag(FeatureFlags.ChartTypeRegistry);
    const flagEnabled = flagQuery.data?.enabled ?? false;
    const registryQuery = useRegistryChartTypes(projectUuid, flagEnabled);
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
    const { track } = useTracking();

    const charts = useMemo(
        () => registryQuery.data?.charts ?? [],
        [registryQuery.data?.charts],
    );
    const visibleCharts = useMemo(
        () =>
            charts.filter(
                (chart) =>
                    chart.state === 'not_installed' ||
                    chart.state === 'incompatible',
            ),
        [charts],
    );
    const availableUpdates = charts.filter(
        (chart) => chart.state === 'update_available' && chart.installedAppUuid,
    );
    const registryEnabled = registryQuery.data?.registryEnabled === true;

    const hasTrackedView = useRef(false);
    useEffect(() => {
        if (hasTrackedView.current || !flagEnabled || !registryEnabled) return;
        hasTrackedView.current = true;
        track({
            name: EventName.CHART_TYPE_LIBRARY_VIEWED,
            properties: { projectUuid, chartCount: visibleCharts.length },
        });
    }, [
        flagEnabled,
        registryEnabled,
        visibleCharts.length,
        projectUuid,
        track,
    ]);

    if (!flagEnabled) {
        return null;
    }

    if (registryQuery.data && !registryQuery.data.registryEnabled) {
        return null;
    }

    const allInstalled = charts.length > 0 && visibleCharts.length === 0;
    const selected =
        visibleCharts.find((chart) => chart.slug === selectedSlug) ?? null;
    // A fetch error with no cached data is the only case that has to be
    // shown; an error alongside cached data just keeps showing that data.
    const isOffline = !!registryQuery.error && !registryQuery.data;

    return (
        <Stack gap="md">
            {withHeader && (
                <Group justify="space-between" align="center">
                    <Group gap={6} align="baseline">
                        <Text size="md" fw={600} c="ldGray.8">
                            Chart type library
                        </Text>
                        {registryQuery.data && (
                            <Text fz="xs" c="dimmed">
                                ({visibleCharts.length})
                            </Text>
                        )}
                    </Group>
                </Group>
            )}

            {onShowInstalled && availableUpdates.length > 0 && (
                <Stack gap={4} w={420} maw="100%">
                    <Text size="sm" fw={600} mb={4}>
                        Updates available for installed charts
                    </Text>
                    {availableUpdates.map((chart) => (
                        <Button
                            key={chart.slug}
                            variant="default"
                            size="xs"
                            h="auto"
                            py={6}
                            px="xs"
                            leftSection={
                                <MantineIcon
                                    icon={getChartTypeIcon(chart.icon)}
                                    size={16}
                                />
                            }
                            onClick={() =>
                                onShowInstalled(chart.installedAppUuid!)
                            }
                            styles={{ label: { width: '100%' } }}
                        >
                            <Group justify="space-between" w="100%" wrap="wrap">
                                <Text size="xs" fw={500}>
                                    {chart.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {chart.installedRegistryVersion
                                        ? `v${chart.installedRegistryVersion} → v${chart.version}`
                                        : `Upgrade to v${chart.version}`}
                                </Text>
                            </Group>
                        </Button>
                    ))}
                </Stack>
            )}

            <Callout variant="info">
                These chart types are available to add to your instance. Once
                installed, they can be used by anyone building charts in your
                organization.
            </Callout>

            {registryQuery.isInitialLoading ? (
                <EmptyStateLoader title="Loading chart type library…" />
            ) : isOffline ? (
                <InlineErrorState
                    message="The chart type library can't be reached right now. It may be a temporary outage or a network restriction on this instance."
                    onRetry={() => void registryQuery.refetch()}
                />
            ) : visibleCharts.length === 0 ? (
                <Paper variant="dotted" p="xl">
                    <Text ta="center" fz="xs" c="dimmed">
                        {allInstalled
                            ? 'Every chart type from the library is installed — find them in your installed chart types.'
                            : 'No chart types available in the registry yet.'}
                    </Text>
                </Paper>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {visibleCharts.map((chart) => (
                        <ChartTypeLibraryCard
                            key={chart.slug}
                            item={chart}
                            onClick={() => {
                                track({
                                    name: EventName.CHART_TYPE_LIBRARY_CHART_CLICKED,
                                    properties: {
                                        projectUuid,
                                        chartSlug: chart.slug,
                                        channel: chart.channel ?? 'stable',
                                        state: chart.state,
                                    },
                                });
                                setSelectedSlug(chart.slug);
                            }}
                        />
                    ))}
                </SimpleGrid>
            )}

            {selected && (
                <ChartTypeLibraryDetailModal
                    projectUuid={projectUuid}
                    item={selected}
                    onClose={() => setSelectedSlug(null)}
                    onInstalled={onInstalled}
                />
            )}
        </Stack>
    );
};

export default ChartTypeLibrarySection;
