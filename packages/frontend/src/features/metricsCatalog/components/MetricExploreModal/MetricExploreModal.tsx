import {
    ECHARTS_DEFAULT_COLORS,
    getDefaultDateRangeFromInterval,
    getFilterDimensionsForMetric,
    getInitialDefaultFilterRule,
    getInitialDefaultSegment,
    getSegmentDimensionsForMetric,
    MetricExplorerComparison,
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
import styles from './MetricExploreModal.module.css';
import { SaveChartButton } from './SaveChartButton';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
} & (
        | {
              // List view: metric comes from the URL; prev/next and close
              // navigate the URL.
              navigation: 'url';
          }
        | {
              // Canvas: metric comes from Redux state; prev/next updates state
              // and close does not navigate (stays on the canvas).
              navigation: 'state';
              selectedMetric: Pick<CatalogField, 'name' | 'tableName'>;
              onSelectMetric: (metric: CatalogField) => void;
          }
    );

/**
 * MetricExploreModal implementation using echarts via VisualizationProvider
 */
export const MetricExploreModal: FC<Props> = (props) => {
    const { opened, onClose, metrics } = props;
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

    const params = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const tableName =
        props.navigation === 'state'
            ? props.selectedMetric.tableName
            : params.tableName;
    const metricName =
        props.navigation === 'state'
            ? props.selectedMetric.name
            : params.metricName;

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

    // Prev/next walk the catalog list order, which only makes sense in the
    // list view. From the canvas/tree the order is unrelated to what's on
    // screen, so navigation is disabled there.
    const canNavigateBetweenMetrics = props.navigation === 'url';

    const nextMetricInList = metrics[currentMetricIndex + 1];
    const previousMetricInList = metrics[currentMetricIndex - 1];

    const onSelectMetric =
        props.navigation === 'state' ? props.onSelectMetric : undefined;

    const navigateToMetric = useCallback(
        (metric: CatalogField) => {
            if (onSelectMetric) {
                onSelectMetric(metric);
                return;
            }
            void navigate({
                pathname: `/projects/${projectUuid}/metrics/peek/${metric.tableName}/${metric.name}`,
                search: location.search,
            });
        },
        [navigate, projectUuid, location.search, onSelectMetric],
    );

    // State for time dimension override (granularity changes)
    const [timeDimensionOverride, setTimeDimensionOverride] = useState<
        TimeDimensionConfig | undefined
    >();

    const [dateRange, setDateRange] = useState<
        MetricExplorerDateRange | undefined
    >();

    // The user's explicit filter for this metric view. undefined = pristine
    // (derive from the metric's spotlight default), null = explicitly cleared.
    const [userFilterRule, setUserFilterRule] = useState<
        FilterRule | null | undefined
    >(undefined);

    // The user's explicit query for this metric view. undefined = pristine
    // (derive from the metric's spotlight default segment).
    const [userQuery, setUserQuery] = useState<MetricExplorerQuery | undefined>(
        undefined,
    );

    // Reset override when navigating to a different metric
    const resetQueryState = useCallback(() => {
        setTimeDimensionOverride(undefined);
        setDateRange(undefined);
        setUserFilterRule(undefined);
        setUserQuery(undefined);
    }, [
        setTimeDimensionOverride,
        setDateRange,
        setUserFilterRule,
        setUserQuery,
    ]);

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
        if (props.navigation === 'url') {
            void navigate({
                pathname: `/projects/${projectUuid}/metrics`,
                search: location.search,
            });
        }
        onClose();
    }, [navigate, onClose, projectUuid, location.search, props.navigation]);

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

    // The metric's YAML spotlight defaults, resolved against the loaded
    // dimension allowlists (null/undefined when absent or unavailable).
    const defaultSegment = useMemo(
        () =>
            getInitialDefaultSegment(
                currentMetric,
                availableSegmentByDimensions,
            ),
        [currentMetric, availableSegmentByDimensions],
    );
    const defaultFilterRule = useMemo(
        () =>
            getInitialDefaultFilterRule(
                currentMetric,
                availableFilterByDimensions,
            ),
        [currentMetric, availableFilterByDimensions],
    );

    // Effective query/filter: the user's explicit choice once made, otherwise
    // derived from the metric's spotlight defaults (which resolve whenever the
    // dimension lists load — no seeding, so they can never be missed or leak
    // across metrics).
    const query = useMemo<MetricExplorerQuery>(
        () =>
            userQuery ?? {
                comparison: MetricExplorerComparison.NONE,
                segmentDimension: defaultSegment,
            },
        [userQuery, defaultSegment],
    );
    const filterRule: FilterRule | undefined =
        userFilterRule === undefined
            ? defaultFilterRule
            : (userFilterRule ?? undefined);

    const segmentDimensionId = useMemo(() => {
        return 'segmentDimension' in query ? query.segmentDimension : null;
    }, [query]);

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

    const metricsWithTimeDimensionsQuery = useCatalogMetricsWithTimeDimensions({
        projectUuid,
        tableName,
        options: {
            enabled:
                query.comparison === MetricExplorerComparison.DIFFERENT_METRIC,
        },
    });

    // Keyboard navigation (list view only — see canNavigateBetweenMetrics)
    useHotkeys(
        canNavigateBetweenMetrics
            ? [
                  ['ArrowUp', handleGoToPreviousMetric],
                  ['ArrowDown', handleGoToNextMetric],
              ]
            : [],
    );

    const handleSegmentDimensionChange = useCallback(
        (value: string | null) => {
            setUserQuery({
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
            setUserQuery,
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
            // Store null (not undefined) on clear so it records an explicit
            // choice and the metric's default filter is not re-derived.
            setUserFilterRule(nextFilterRule ?? null);
        },
        [setUserFilterRule],
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
        [track, userUuid, organizationUuid, projectUuid, metricName, tableName],
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
                                    disabled={
                                        !canNavigateBetweenMetrics ||
                                        !previousMetricInList
                                    }
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
                                    disabled={
                                        !canNavigateBetweenMetrics ||
                                        !nextMetricInList
                                    }
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
                                    initialFilterRule={defaultFilterRule}
                                    key={`${tableName}-${metricName}-${
                                        defaultFilterRule?.target.fieldId ??
                                        'none'
                                    }`}
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
                                                setUserQuery({
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
                                        onQueryChange={setUserQuery}
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
                                        resolvedTimezone={
                                            resultsData.resolvedTimezone
                                        }
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
