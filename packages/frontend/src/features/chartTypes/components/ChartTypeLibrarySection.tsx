import { FeatureFlags } from '@lightdash/common';
import { Group, Paper, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import { useRegistryChartTypes } from '../hooks/useRegistryChartTypes';
import ChartTypeLibraryCard from './ChartTypeLibraryCard';
import ChartTypeLibraryDetailModal from './ChartTypeLibraryDetailModal';

type Props = {
    projectUuid: string;
    withHeader?: boolean;
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
}) => {
    const flagQuery = useServerFeatureFlag(FeatureFlags.ChartTypeRegistry);
    const flagEnabled = flagQuery.data?.enabled ?? false;
    const registryQuery = useRegistryChartTypes(projectUuid, flagEnabled);
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

    if (!flagEnabled) {
        return null;
    }

    if (registryQuery.data && !registryQuery.data.registryEnabled) {
        return null;
    }

    const charts = registryQuery.data?.charts ?? [];
    // Installed chart types (upgradable ones included) live in the installed
    // tab only, where upgrades are offered; the library lists what there is
    // to get — new or incompatible.
    const visibleCharts = charts.filter(
        (chart) =>
            chart.state === 'not_installed' || chart.state === 'incompatible',
    );
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

            <Text fz="sm" c="dimmed">
                These chart types are available to add to your instance. Once
                installed, they can be used by anyone building charts in your
                organization.
            </Text>

            {registryQuery.isInitialLoading ? (
                <EmptyStateLoader title="Loading chart type library…" />
            ) : isOffline ? (
                <Paper variant="dotted" p="xl">
                    <Text ta="center" fz="xs" c="dimmed">
                        The chart type library is unavailable right now.
                    </Text>
                </Paper>
            ) : visibleCharts.length === 0 ? (
                <Paper variant="dotted" p="xl">
                    <Text ta="center" fz="xs" c="dimmed">
                        {allInstalled
                            ? 'Every chart type from the library is installed — find them in your installed charts.'
                            : 'No chart types available in the registry yet.'}
                    </Text>
                </Paper>
            ) : (
                <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
                    {visibleCharts.map((chart) => (
                        <ChartTypeLibraryCard
                            key={chart.slug}
                            item={chart}
                            onClick={() => setSelectedSlug(chart.slug)}
                        />
                    ))}
                </SimpleGrid>
            )}

            {selected && (
                <ChartTypeLibraryDetailModal
                    projectUuid={projectUuid}
                    item={selected}
                    onClose={() => setSelectedSlug(null)}
                />
            )}
        </Stack>
    );
};

export default ChartTypeLibrarySection;
