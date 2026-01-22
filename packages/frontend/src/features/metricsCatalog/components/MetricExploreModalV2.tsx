import {
    ECHARTS_DEFAULT_COLORS,
    MetricExplorerComparison,
    TimeFrames,
    getFilterDimensionsForMetric,
    getSegmentDimensionsForMetric,
    type CatalogField,
    type MetricExplorerQuery,
    type TimeDimensionConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Divider,
    Group,
    Kbd,
    LoadingOverlay,
    Modal,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine-8/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconExternalLink,
    IconInfoCircle,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import LightdashVisualization from '../../../components/LightdashVisualization';
import VisualizationProvider from '../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../components/MetricQueryData/MetricQueryDataProvider';
import { useOrganization } from '../../../hooks/organization/useOrganization';
import { getOpenInExploreUrl } from '../../../utils/getOpenInExploreUrl';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCatalogFilterDimensions } from '../hooks/useCatalogFilterDimensions';
import { useCatalogMetricsWithTimeDimensions } from '../hooks/useCatalogMetricsWithTimeDimensions';
import { useCatalogSegmentDimensions } from '../hooks/useCatalogSegmentDimensions';
import { useMetricVisualization } from '../hooks/useMetricVisualization';
import styles from './MetricExploreModalV2.module.css';
import { MetricExploreComparison as MetricExploreComparisonSection } from './visualization/MetricExploreComparison';
import { MetricExploreDatePicker } from './visualization/MetricExploreDatePicker';
import { MetricExploreFilter } from './visualization/MetricExploreFilter';
import { MetricExploreSegmentationPicker } from './visualization/MetricExploreSegmentationPicker';
import { TimeDimensionIntervalPicker } from './visualization/TimeDimensionIntervalPicker';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
};

/**
 * V2: MetricExploreModal implementation using echarts via VisualizationProvider
 * This is enabled when the MetricsCatalogEchartsVisualization feature flag is ON
 */
export const MetricExploreModalV2: FC<Props> = ({
    opened,
    onClose,
    metrics,
}) => {
    const { data: organization } = useOrganization();

    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const navigate = useNavigate();
    const location = useLocation();

    // Color palette from organization settings
    const colorPalette = useMemo(
        () => organization?.chartColors ?? ECHARTS_DEFAULT_COLORS,
        [organization?.chartColors],
    );

    // Metric navigation logic
    const currentMetricIndex = useMemo(
        () =>
            metrics.findIndex(
                (metric) =>
                    metric.name === metricName &&
                    metric.tableName === tableName,
            ),
        [metrics, metricName, tableName],
    );

    const nextMetricInList = metrics[currentMetricIndex + 1];
    const previousMetricInList = metrics[currentMetricIndex - 1];

    const navigateToMetric = useCallback(
        (metric: CatalogField) => {
            void navigate({
                pathname: `/projects/${projectUuid}/metrics/peek/${metric.tableName}/${metric.name}`,
                search: location.search,
            });
        },
        [navigate, projectUuid, location.search],
    );

    // State for time dimension override (granularity changes)
    const [timeDimensionOverride, setTimeDimensionOverride] = useState<
        TimeDimensionConfig | undefined
    >();

    const [query, setQuery] = useState<MetricExplorerQuery>({
        comparison: MetricExplorerComparison.NONE,
        segmentDimension: null,
    });

    const segmentDimensionId = useMemo(() => {
        return 'segmentDimension' in query ? query.segmentDimension : null;
    }, [query]);

    // Reset override when navigating to a different metric
    const resetQueryState = useCallback(() => {
        setTimeDimensionOverride(undefined);
        setQuery({
            comparison: MetricExplorerComparison.NONE,
            segmentDimension: null,
        });
    }, [setTimeDimensionOverride, setQuery]);

    // Update navigateToMetric to reset state
    const navigateToMetricWithReset = useCallback(
        (metric: CatalogField) => {
            resetQueryState();
            navigateToMetric(metric);
        },
        [navigateToMetric, resetQueryState],
    );

    const handleGoToNextMetric = useCallback(() => {
        if (nextMetricInList) navigateToMetricWithReset(nextMetricInList);
    }, [navigateToMetricWithReset, nextMetricInList]);

    const handleGoToPreviousMetric = useCallback(() => {
        if (previousMetricInList)
            navigateToMetricWithReset(previousMetricInList);
    }, [navigateToMetricWithReset, previousMetricInList]);

    const handleClose = useCallback(() => {
        void navigate({
            pathname: `/projects/${projectUuid}/metrics`,
            search: location.search,
        });
        onClose();
    }, [navigate, onClose, projectUuid, location.search]);

    // All data fetching, query execution, and config building in one hook
    const {
        metricField,
        explore,
        metricQuery,
        timeDimensionConfig,
        chartConfig,
        resultsData,
        columnOrder,
        isLoading,
        hasData,
    } = useMetricVisualization({
        projectUuid,
        tableName,
        metricName,
        timeDimensionOverride,
        segmentDimensionId,
        comparison: query.comparison,
    });

    const metricsWithTimeDimensionsQuery = useCatalogMetricsWithTimeDimensions({
        projectUuid,
        options: {
            enabled:
                query.comparison === MetricExplorerComparison.DIFFERENT_METRIC,
        },
    });

    const filterDimensionsQuery = useCatalogFilterDimensions({
        projectUuid,
        tableName,
        options: {
            enabled: !!projectUuid && !!tableName,
        },
    });

    const segmentDimensionsQuery = useCatalogSegmentDimensions({
        projectUuid,
        tableName,
        options: {
            enabled: !!projectUuid && !!tableName,
        },
    });

    const currentMetric = metrics[currentMetricIndex];

    const availableFilterByDimensions = useMemo(
        () =>
            getFilterDimensionsForMetric(
                filterDimensionsQuery.data ?? [],
                currentMetric,
            ),
        [filterDimensionsQuery.data, currentMetric],
    );

    const availableSegmentByDimensions = useMemo(
        () =>
            getSegmentDimensionsForMetric(
                segmentDimensionsQuery.data ?? [],
                currentMetric,
            ),
        [segmentDimensionsQuery.data, currentMetric],
    );

    const openInExploreUrl = useMemo(() => {
        if (!metricQuery || !chartConfig) return undefined;
        return getOpenInExploreUrl({
            metricQuery,
            projectUuid,
            columnOrder,
            pivotColumns: segmentDimensionId ? [segmentDimensionId] : undefined,
            chartConfig,
        });
    }, [
        metricQuery,
        projectUuid,
        columnOrder,
        segmentDimensionId,
        chartConfig,
    ]);

    // Keyboard navigation
    useHotkeys([
        ['ArrowUp', handleGoToPreviousMetric],
        ['ArrowDown', handleGoToNextMetric],
    ]);

    const handleSegmentDimensionChange = useCallback(
        (value: string | null) => {
            setQuery({
                comparison: MetricExplorerComparison.NONE,
                segmentDimension: value,
            });
        },
        [setQuery],
    );

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            scrollAreaComponent={undefined}
            size="auto"
        >
            <Modal.Overlay />
            <Modal.Content className={styles.modalContent} radius={12} w="100%">
                <Modal.Header h={52} className={styles.modalHeader}>
                    <Group gap="xs">
                        <Group gap="xxs">
                            <Tooltip
                                label={
                                    <Text>
                                        Press{' '}
                                        <Kbd className={styles.kbd}>↑</Kbd> to
                                        move to the previous metric.
                                    </Text>
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    variant="outline"
                                    size="sm"
                                    radius="sm"
                                    className={styles.navActionIcon}
                                    onClick={handleGoToPreviousMetric}
                                    disabled={!previousMetricInList}
                                >
                                    <MantineIcon icon={IconChevronUp} />
                                </ActionIcon>
                            </Tooltip>
                            <Tooltip
                                label={
                                    <Text>
                                        Press{' '}
                                        <Kbd className={styles.kbd}>↓</Kbd> to
                                        move to the next metric.
                                    </Text>
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    variant="outline"
                                    size="sm"
                                    radius="sm"
                                    className={styles.navActionIcon}
                                    onClick={handleGoToNextMetric}
                                    disabled={!nextMetricInList}
                                >
                                    <MantineIcon icon={IconChevronDown} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        <Text fw={600} fz="md" c="ldGray.8">
                            {metricField?.label}
                        </Text>
                        <Tooltip
                            label={metricField?.description}
                            disabled={!metricField?.description}
                        >
                            <MantineIcon
                                color="ldGray.5"
                                icon={IconInfoCircle}
                                size={18}
                            />
                        </Tooltip>
                    </Group>
                    <Group gap="xs">
                        <Tooltip
                            label="Explore from here"
                            position="bottom"
                            disabled={!openInExploreUrl}
                        >
                            {openInExploreUrl ? (
                                <Button
                                    component={Link}
                                    to={openInExploreUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    variant="default"
                                    size="xs"
                                    radius="md"
                                    leftSection={
                                        <MantineIcon icon={IconExternalLink} />
                                    }
                                >
                                    Explore from here
                                </Button>
                            ) : (
                                <Button
                                    component="button"
                                    type="button"
                                    variant="default"
                                    size="xs"
                                    radius="md"
                                    leftSection={
                                        <MantineIcon icon={IconExternalLink} />
                                    }
                                    disabled
                                >
                                    Explore from here
                                </Button>
                            )}
                        </Tooltip>
                        <Modal.CloseButton />
                    </Group>
                </Modal.Header>

                <Modal.Body
                    p={0}
                    h="80vh"
                    className={styles.modalBody}
                    miw={800}
                    mih={600}
                >
                    <Stack w={460}>
                        <Box
                            px="lg"
                            py="md"
                            className={styles.sidebarContainer}
                        >
                            <Stack gap="xl" w="100%">
                                <Box pos="relative">
                                    <Box className={styles.disabledOverlay}>
                                        <MetricExploreFilter
                                            dimensions={
                                                availableFilterByDimensions
                                            }
                                            onFilterApply={() => {}}
                                        />
                                    </Box>
                                    <Box pos="absolute" inset={0}>
                                        <Tooltip
                                            label="Coming soon"
                                            position="right"
                                            withinPortal
                                        >
                                            <Box w="100%" h="100%" />
                                        </Tooltip>
                                    </Box>
                                </Box>

                                <MetricExploreSegmentationPicker
                                    query={query}
                                    onSegmentDimensionChange={
                                        handleSegmentDimensionChange
                                    }
                                    dimensions={availableSegmentByDimensions}
                                    segmentDimensionsQuery={
                                        segmentDimensionsQuery
                                    }
                                    hasFilteredSeries={false}
                                />

                                <Divider color="ldGray.2" />

                                <Stack gap="xs">
                                    <Group justify="space-between">
                                        <Text fw={500} c="ldGray.7">
                                            Comparison
                                        </Text>
                                        <Button
                                            variant="subtle"
                                            color="dark"
                                            size="compact-xs"
                                            radius="md"
                                            className={styles.clearButton}
                                            data-visible={
                                                query.comparison !==
                                                MetricExplorerComparison.NONE
                                            }
                                            onClick={() =>
                                                setQuery({
                                                    comparison:
                                                        MetricExplorerComparison.NONE,
                                                    segmentDimension: null,
                                                })
                                            }
                                        >
                                            Clear
                                        </Button>
                                    </Group>

                                    <MetricExploreComparisonSection
                                        baseMetricLabel={metricField?.label}
                                        query={query}
                                        onQueryChange={setQuery}
                                        metricsWithTimeDimensionsQuery={
                                            metricsWithTimeDimensionsQuery
                                        }
                                        // TODO: enable this when it's implemented
                                        canCompareToAnotherMetric={false}
                                    />
                                </Stack>
                            </Stack>
                        </Box>
                    </Stack>

                    <Divider orientation="vertical" color="ldGray.2" />

                    <Stack w="100%" py="xl" px="xxl" pos="relative" gap="md">
                        <LoadingOverlay visible={isLoading} />

                        {/* Granularity picker */}
                        {timeDimensionConfig && (
                            <Group
                                gap="sm"
                                justify="space-between"
                                wrap="nowrap"
                            >
                                <MetricExploreDatePicker
                                    dateRange={[new Date(), new Date()]}
                                    onChange={() => {}}
                                    showTimeDimensionIntervalPicker={false}
                                    isFetching={false}
                                    timeDimensionBaseField={undefined}
                                    setTimeDimensionOverride={() => {}}
                                    timeInterval={TimeFrames.DAY}
                                    onTimeIntervalChange={() => {}}
                                    // TODO: enable this when it's implemented
                                    disabled
                                />
                                <Tooltip
                                    label="Change granularity"
                                    position="top"
                                    withinPortal
                                >
                                    <Box>
                                        <TimeDimensionIntervalPicker
                                            dimension={timeDimensionConfig}
                                            onChange={setTimeDimensionOverride}
                                        />
                                    </Box>
                                </Tooltip>
                            </Group>
                        )}

                        {/* ECharts visualization */}
                        <Box flex={1}>
                            {hasData && metricQuery && tableName && explore && (
                                <MetricQueryDataProvider
                                    metricQuery={metricQuery}
                                    tableName={tableName}
                                    explore={explore}
                                >
                                    <VisualizationProvider
                                        resultsData={resultsData}
                                        chartConfig={chartConfig}
                                        columnOrder={columnOrder}
                                        initialPivotDimensions={
                                            segmentDimensionId
                                                ? [segmentDimensionId]
                                                : undefined
                                        }
                                        colorPalette={colorPalette}
                                        isLoading={isLoading}
                                        onSeriesContextMenu={undefined}
                                        onChartConfigChange={undefined}
                                        pivotTableMaxColumnLimit={60}
                                    >
                                        <LightdashVisualization />
                                    </VisualizationProvider>
                                </MetricQueryDataProvider>
                            )}
                        </Box>
                    </Stack>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
