import { FeatureFlags } from '@lightdash/common';
import {
    Box,
    Button,
    Collapse,
    Group,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import EmptyStateLoader from '../../../components/common/EmptyStateLoader';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../components/common/PolymorphicPaperButton';
import TruncatedText from '../../../components/common/TruncatedText';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useRegistryChartTypes } from '../hooks/useRegistryChartTypes';
import { getChartTypeIcon } from '../utils/chartTypeIcons';
import ChartTypeLibraryCard from './ChartTypeLibraryCard';
import ChartTypeLibraryDetailModal from './ChartTypeLibraryDetailModal';
import classes from './ChartTypeLibrarySection.module.css';
import ChartTypeUpgradeAllModal from './ChartTypeUpgradeAllModal';

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
    const { t } = useTranslation('chartTypes');
    const flagQuery = useServerFeatureFlag(FeatureFlags.ChartTypeRegistry);
    const flagEnabled = flagQuery.data?.enabled ?? false;
    const registryQuery = useRegistryChartTypes(projectUuid, flagEnabled);
    const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
    const [updatesOpen, { toggle: toggleUpdates }] = useDisclosure(false);
    const [isUpgradeAllOpen, setIsUpgradeAllOpen] = useState(false);
    const canUpgrade = useCanCreateDataApp(projectUuid);
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
                            {t('library.title')}
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
                <Stack gap="xs">
                    <Group justify="space-between" gap="xs">
                        <Button
                            variant="subtle"
                            size="xs"
                            className={classes.updatesToggle}
                            aria-expanded={updatesOpen}
                            leftSection={
                                <MantineIcon icon={IconInfoCircle} size={14} />
                            }
                            rightSection={
                                <MantineIcon
                                    icon={
                                        updatesOpen
                                            ? IconChevronUp
                                            : IconChevronDown
                                    }
                                    size={14}
                                />
                            }
                            onClick={toggleUpdates}
                        >
                            {t('library.updatesAvailable', {
                                count: availableUpdates.length,
                            })}
                        </Button>
                        {updatesOpen && canUpgrade && (
                            <Button
                                variant="filled"
                                size="xs"
                                onClick={() => setIsUpgradeAllOpen(true)}
                            >
                                {t('library.upgradeAll')}
                            </Button>
                        )}
                    </Group>
                    <Collapse expanded={updatesOpen}>
                        <SimpleGrid
                            cols={{ base: 2, sm: 3, md: 4, lg: 5 }}
                            spacing="xs"
                        >
                            {availableUpdates.map((chart) => (
                                <PolymorphicPaperButton
                                    key={chart.slug}
                                    component="button"
                                    px="xs"
                                    py={6}
                                    className={classes.updateTile}
                                    onClick={() =>
                                        onShowInstalled(chart.installedAppUuid!)
                                    }
                                >
                                    <Group
                                        gap="xs"
                                        wrap="nowrap"
                                        align="flex-start"
                                    >
                                        <Box className={classes.updateTileIcon}>
                                            <MantineIcon
                                                icon={getChartTypeIcon(
                                                    chart.icon,
                                                )}
                                                size={14}
                                                color="dimmed"
                                            />
                                        </Box>
                                        <Stack gap={0} miw={0}>
                                            <TruncatedText
                                                maxWidth="100%"
                                                fz="xs"
                                                fw={500}
                                            >
                                                {chart.name}
                                            </TruncatedText>
                                            <Text fz="xs" c="dimmed">
                                                {chart.installedRegistryVersion
                                                    ? `v${chart.installedRegistryVersion} → v${chart.version}`
                                                    : t('detail.upgradeTo', {
                                                          version:
                                                              chart.version,
                                                      })}
                                            </Text>
                                        </Stack>
                                    </Group>
                                </PolymorphicPaperButton>
                            ))}
                        </SimpleGrid>
                    </Collapse>
                </Stack>
            )}

            <Callout variant="info">{t('library.availableCallout')}</Callout>

            {registryQuery.isInitialLoading ? (
                <EmptyStateLoader title={t('library.loading')} />
            ) : isOffline ? (
                <InlineErrorState
                    message={t('library.offline')}
                    onRetry={() => void registryQuery.refetch()}
                />
            ) : visibleCharts.length === 0 ? (
                <Paper variant="dotted" p="xl">
                    <Text ta="center" fz="xs" c="dimmed">
                        {allInstalled
                            ? t('library.allInstalled')
                            : t('library.empty')}
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
            {isUpgradeAllOpen && (
                <ChartTypeUpgradeAllModal
                    projectUuid={projectUuid}
                    updates={availableUpdates}
                    onClose={() => setIsUpgradeAllOpen(false)}
                />
            )}
        </Stack>
    );
};

export default ChartTypeLibrarySection;
