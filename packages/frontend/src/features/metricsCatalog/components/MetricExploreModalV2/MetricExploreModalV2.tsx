import {
    ECHARTS_DEFAULT_COLORS,
    MetricExplorerComparison,
    getDefaultDateRangeFromInterval,
    getFilterDimensionsForMetric,
    getSegmentDimensionsForMetric,
    type CatalogField,
    type FilterRule,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type TimeDimensionConfig,
    type TimeFrames,
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
    IconInfoCircle,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import LightdashVisualization from '../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../components/LightdashVisualization/VisualizationProvider';
import MetricQueryDataProvider from '../../../../components/MetricQueryData/MetricQueryDataProvider';
import { useOrganization } from '../../../../hooks/organization/useOrganization';
import useTracking from '../../../../providers/Tracking/useTracking';
import { EventName } from '../../../../types/Events';
import { useAppSelector } from '../../../sqlRunner/store/hooks';
import { useCatalogFilterDimensions } from '../../hooks/useCatalogFilterDimensions';
import { useCatalogMetricsWithTimeDimensions } from '../../hooks/useCatalogMetricsWithTimeDimensions';
import { useCatalogSegmentDimensions } from '../../hooks/useCatalogSegmentDimensions';
import { useMetricVisualization } from '../../hooks/useMetricVisualization';
import { MetricsVisualizationEmptyState } from '../MetricsVisualizationEmptyState';
import { MetricExploreComparison as MetricExploreComparisonSection } from '../visualization/MetricExploreComparison';
import { MetricExploreDatePicker } from '../visualization/MetricExploreDatePicker';
import { MetricExploreFilter } from '../visualization/MetricExploreFilter';
import { MetricExploreSegmentationPicker } from '../visualization/MetricExploreSegmentationPicker';
import { ExploreFromHereButton } from './ExploreFromHereButton';
import styles from './MetricExploreModalV2.module.css';
import { SaveChartButton } from './SaveChartButton';

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
    const { track } = useTracking();
    const { data: organization } = useOrganization();

    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );
    const canExploreFromHere = useAppSelector(
        (state) => state.metricsCatalog.abilities.canManageExplore,
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

    const [dateRange, setDateRange] = useState<
        MetricExplorerDateRange | undefined
    >();

    const [filterRule, setFilterRule] = useState<FilterRule | undefined>();

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
        setDateRange(undefined);
        setFilterRule(undefined);
        setQuery({
            comparison: MetricExplorerComparison.NONE,
            segmentDimension: null,
        });
    }, [setTimeDimensionOverride, setDateRange, setFilterRule, setQuery]);

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
        effectiveDateRange,
        chartConfig,
        resultsData,
        columnOrder,
        computedSeries,
        unsavedChartVersion,
        isLoading,
        hasData,
    } = useMetricVisualization({
        projectUuid,
        tableName,
        metricName,
        timeDimensionOverride,
        segmentDimensionId,
        filterRule,
        dateRange,
        comparison: query.comparison,
        compareMetric:
            query.comparison === MetricExplorerComparison.DIFFERENT_METRIC
                ? query.metric
                : null,
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

    const metricsWithTimeDimensionsQuery = useCatalogMetricsWithTimeDimensions({
        projectUuid,
        tableName,
        options: {
            enabled:
                query.comparison === MetricExplorerComparison.DIFFERENT_METRIC,
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

            track({
                name: EventName.METRICS_CATALOG_EXPLORE_SEGMENT_BY_APPLIED,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                    segmentDimension: value,
                },
            });
        },
        [
            setQuery,
            track,
            userUuid,
            organizationUuid,
            projectUuid,
            metricName,
            tableName,
        ],
    );

    const handleFilterApply = useCallback(
        (nextFilterRule: FilterRule | undefined) => {
            setFilterRule(nextFilterRule);
        },
        [setFilterRule],
    );

    const handleTimeIntervalChange = useCallback(
        (timeInterval: TimeFrames) => {
            setDateRange(getDefaultDateRangeFromInterval(timeInterval));

            track({
                name: EventName.METRICS_CATALOG_EXPLORE_GRANULARITY_APPLIED,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                    granularity: timeInterval,
                },
            });
        },
        [
            track,
            userUuid,
            organizationUuid,
            projectUuid,
            metricName,
            tableName,
        ],
    );

    // Track time dimension override changes
    useEffect(() => {
        if (timeDimensionOverride) {
            track({
                name: EventName.METRICS_CATALOG_EXPLORE_TIME_DIMENSION_OVERRIDE_APPLIED,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                },
            });
        }
    }, [
        timeDimensionOverride,
        organizationUuid,
        projectUuid,
        metricName,
        tableName,
        track,
        userUuid,
    ]);

    // Track comparison changes
    useEffect(() => {
        if (query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
            track({
                name: EventName.METRICS_CATALOG_EXPLORE_COMPARE_LAST_PERIOD,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                },
            });
        }

        if (
            query.comparison === MetricExplorerComparison.DIFFERENT_METRIC &&
            query.metric.name !== '' &&
            query.metric.table !== ''
        ) {
            track({
                name: EventName.METRICS_CATALOG_EXPLORE_COMPARE_ANOTHER_METRIC,
                properties: {
                    userId: userUuid,
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                    compareMetricName: query.metric.name,
                    compareTableName: query.metric.table,
                },
            });
        }
    }, [
        query,
        organizationUuid,
        projectUuid,
        metricName,
        tableName,
        track,
        userUuid,
    ]);

    const showEmptyState = !isLoading && resultsData.totalResults === 0;

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
                        <SaveChartButton
                            projectUuid={projectUuid}
                            unsavedChartVersion={unsavedChartVersion}
                            explore={explore}
                            hasData={hasData}
                            canSave={canExploreFromHere}
                        />
                        <ExploreFromHereButton
                            projectUuid={projectUuid}
                            unsavedChartVersion={unsavedChartVersion}
                            canExplore={canExploreFromHere}
                        />
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
                                <MetricExploreFilter
                                    dimensions={availableFilterByDimensions}
                                    onFilterApply={handleFilterApply}
                                    key={`${tableName}-${metricName}`}
                                />

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
                                    />
                                </Stack>
                            </Stack>
                        </Box>
                    </Stack>

                    <Divider orientation="vertical" color="ldGray.2" />

                    <Stack w="100%" py="xl" px="xxl" pos="relative" gap="md">
                        <LoadingOverlay visible={isLoading} />

                        {/* Granularity picker */}
                        {timeDimensionConfig && effectiveDateRange && (
                            <MetricExploreDatePicker
                                dateRange={effectiveDateRange}
                                onChange={setDateRange}
                                showTimeDimensionIntervalPicker
                                isFetching={isLoading}
                                timeDimensionBaseField={timeDimensionConfig}
                                setTimeDimensionOverride={
                                    setTimeDimensionOverride
                                }
                                timeInterval={timeDimensionConfig.interval}
                                onTimeIntervalChange={handleTimeIntervalChange}
                            />
                        )}

                        {/* ECharts visualization */}
                        <Box flex={1}>
                            {showEmptyState && (
                                <MetricsVisualizationEmptyState />
                            )}

                            {!showEmptyState &&
                                hasData &&
                                metricQuery &&
                                tableName &&
                                explore && (
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
                                            pivotTableMaxColumnLimit={60}
                                            computedSeries={computedSeries}
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
