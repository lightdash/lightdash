import {
    DimensionType,
    MetricExplorerComparison,
    getDefaultDateRangeFromInterval,
    getItemId,
    isDimension,
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
    Modal,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconInfoCircle,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCatalogMetricsWithTimeDimensions } from '../hooks/useCatalogMetricsWithTimeDimensions';
import { useCatalogSegmentDimensions } from '../hooks/useCatalogSegmentDimensions';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';
import { MetricExploreComparison } from './visualization/MetricExploreComparison';
import { MetricExploreFilter } from './visualization/MetricExploreFilter';
import { MetricExploreSegmentationPicker } from './visualization/MetricExploreSegmentationPicker';
import MetricsVisualization from './visualization/MetricsVisualization';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
};

export const MetricExploreModal: FC<Props> = ({ opened, onClose, metrics }) => {
    const { track } = useTracking();

    const userUuid = useAppSelector(
        (state) => state.metricsCatalog.user?.userUuid,
    );
    const organizationUuid = useAppSelector(
        (state) => state.metricsCatalog.organizationUuid,
    );
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const navigate = useNavigate();
    const location = useLocation();
    const [query, setQuery] = useState<MetricExplorerQuery>({
        comparison: MetricExplorerComparison.NONE,
        segmentDimension: null,
    });

    const [dateRange, setDateRange] = useState<MetricExplorerDateRange | null>(
        null,
    );
    const [timeDimensionOverride, setTimeDimensionOverride] = useState<
        TimeDimensionConfig | undefined
    >();
    const [filter, setFilter] = useState<FilterRule | undefined>(undefined);

    const resetQueryState = useCallback(() => {
        setQuery({
            comparison: MetricExplorerComparison.NONE,
            segmentDimension: null,
        });
        setTimeDimensionOverride(undefined);
        setDateRange(null);
        setFilter(undefined);
    }, [setQuery, setTimeDimensionOverride, setDateRange]);

    const currentMetricIndex = useMemo(() => {
        return metrics.findIndex(
            (metric) =>
                metric.name === metricName && metric.tableName === tableName,
        );
    }, [metrics, metricName, tableName]);

    const nextMetricInList = useMemo(() => {
        return metrics[currentMetricIndex + 1];
    }, [currentMetricIndex, metrics]);

    const previousMetricInList = useMemo(() => {
        return metrics[currentMetricIndex - 1];
    }, [currentMetricIndex, metrics]);

    const navigateToMetric = useCallback(
        (metric: CatalogField) => {
            resetQueryState();

            void navigate({
                pathname: `/projects/${projectUuid}/metrics/peek/${metric.tableName}/${metric.name}`,
                search: location.search,
            });
        },
        [navigate, projectUuid, resetQueryState, location.search],
    );

    const handleGoToNextMetric = useCallback(() => {
        if (nextMetricInList) {
            navigateToMetric(nextMetricInList);
        }
    }, [navigateToMetric, nextMetricInList]);

    const handleGoToPreviousMetric = useCallback(() => {
        if (previousMetricInList) {
            navigateToMetric(previousMetricInList);
        }
    }, [navigateToMetric, previousMetricInList]);

    const metricQuery = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    const metricsWithTimeDimensionsQuery = useCatalogMetricsWithTimeDimensions({
        projectUuid,
        options: {
            enabled:
                query.comparison === MetricExplorerComparison.DIFFERENT_METRIC,
        },
    });

    const segmentDimensionsQuery = useCatalogSegmentDimensions({
        projectUuid,
        tableName,
        options: {
            enabled: !!projectUuid && !!tableName,
        },
    });

    const queryHasEmptyMetric = useMemo(() => {
        return (
            query.comparison === MetricExplorerComparison.DIFFERENT_METRIC &&
            query.metric.name === '' &&
            query.metric.table === ''
        );
    }, [query]);

    const isQueryEnabled =
        (!!projectUuid &&
            !!tableName &&
            !!metricName &&
            !!query &&
            !!dateRange &&
            (query.comparison !== MetricExplorerComparison.DIFFERENT_METRIC ||
                (query.comparison ===
                    MetricExplorerComparison.DIFFERENT_METRIC &&
                    query.metric.name !== '' &&
                    query.metric.table !== ''))) ||
        queryHasEmptyMetric;

    const metricResultsQuery = useRunMetricExplorerQuery(
        {
            projectUuid,
            exploreName: tableName,
            metricName,
            dateRange: dateRange ?? undefined,
            query: queryHasEmptyMetric
                ? {
                      comparison: MetricExplorerComparison.NONE,
                      segmentDimension: null,
                  }
                : query,
            timeDimensionOverride,
            filter,
        },
        {
            enabled: isQueryEnabled,
            keepPreviousData: true,
        },
    );

    const timeDimensionBaseField: TimeDimensionConfig | undefined =
        useMemo(() => {
            const timeDimensionField = Object.entries(
                metricResultsQuery.data?.fields ?? {},
            ).find(
                ([_, field]) => 'timeInterval' in field && isDimension(field),
            )?.[1];

            if (
                !isDimension(timeDimensionField) ||
                !timeDimensionField.timeInterval ||
                !timeDimensionField.timeIntervalBaseDimensionName
            )
                return undefined;

            return {
                field: timeDimensionField.timeIntervalBaseDimensionName,
                interval: timeDimensionField.timeInterval,
                table: timeDimensionField.table,
            };
        }, [metricResultsQuery.data?.fields]);

    useEffect(
        function setInitialDateRange() {
            if (metricQuery.isSuccess && !dateRange) {
                const timeDimension = metricQuery.data?.timeDimension;
                if (timeDimension) {
                    setDateRange(
                        getDefaultDateRangeFromInterval(timeDimension.interval),
                    );
                }
            }
        },
        [metricQuery.isSuccess, metricQuery.data, dateRange],
    );

    useEffect(
        function handleTimeDimensionChange() {
            if (
                timeDimensionOverride &&
                timeDimensionOverride.interval !==
                    timeDimensionBaseField?.interval &&
                !dateRange
            ) {
                setDateRange(
                    getDefaultDateRangeFromInterval(
                        timeDimensionOverride.interval,
                    ),
                );
            }
        },
        [timeDimensionOverride, timeDimensionBaseField, dateRange, track],
    );

    const handleTimeIntervalChange = useCallback(
        function handleTimeIntervalChange(timeInterval: TimeFrames) {
            // Always reset the date range to the default range for the new interval
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

            if (timeDimensionBaseField) {
                setTimeDimensionOverride({
                    ...timeDimensionBaseField,
                    interval: timeInterval,
                });
            }
        },
        [
            metricName,
            organizationUuid,
            projectUuid,
            tableName,
            timeDimensionBaseField,
            track,
            userUuid,
        ],
    );

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
        [metricName, organizationUuid, projectUuid, tableName, track, userUuid],
    );

    const handleClose = useCallback(() => {
        void navigate({
            pathname: `/projects/${projectUuid}/metrics`,
            search: location.search,
        });

        resetQueryState();

        onClose();
    }, [navigate, onClose, projectUuid, resetQueryState, location.search]);

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
            !queryHasEmptyMetric &&
            query.comparison === MetricExplorerComparison.DIFFERENT_METRIC
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
        queryHasEmptyMetric,
        userUuid,
    ]);

    const segmentByData = useMemo(() => {
        return (
            segmentDimensionsQuery.data?.map((dimension) => ({
                value: getItemId(dimension),
                label: dimension.label,
                group: dimension.tableLabel,
            })) ?? []
        );
    }, [segmentDimensionsQuery.data]);

    useHotkeys([
        ['ArrowUp', () => handleGoToPreviousMetric()],
        ['ArrowDown', () => handleGoToNextMetric()],
    ]);

    const handleFilterApply = useCallback(
        (filterRule: FilterRule | undefined) => {
            setFilter(filterRule);
        },
        [],
    );

    const availableFilters = useMemo(
        () =>
            // TODO: Get filters from the query instead of segmentByData, this should include numeric dimensions as well
            segmentDimensionsQuery.data?.filter(
                (dimension) =>
                    dimension.type === DimensionType.STRING ||
                    dimension.type === DimensionType.BOOLEAN,
            ) ?? [],
        [segmentDimensionsQuery.data],
    );

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            scrollAreaComponent={undefined}
            size="auto"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius={12} w="100%">
                <Modal.Header
                    h={52}
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
                        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    })}
                >
                    <Group spacing="xs">
                        <Group spacing="xxs">
                            <Tooltip
                                label={
                                    <Text>
                                        Press{' '}
                                        <Kbd
                                            sx={{
                                                background: '#575656',
                                                color: 'white',
                                                borderRadius: '5px',
                                                border: '1px solid #2b2b2a',
                                            }}
                                        >
                                            ↑
                                        </Kbd>{' '}
                                        to move to the previous metric.
                                    </Text>
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    variant="outline"
                                    size="sm"
                                    radius="sm"
                                    sx={(theme) => ({
                                        border: `1px solid ${theme.colors.ldGray[2]}`,
                                    })}
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
                                        <Kbd
                                            sx={{
                                                background: '#575656',
                                                color: 'white',
                                                borderRadius: '5px',
                                                border: '1px solid #2b2b2a',
                                            }}
                                        >
                                            ↓
                                        </Kbd>{' '}
                                        to move to the next metric.
                                    </Text>
                                }
                                position="bottom"
                            >
                                <ActionIcon
                                    variant="outline"
                                    size="sm"
                                    radius="sm"
                                    sx={(theme) => ({
                                        border: `1px solid ${theme.colors.ldGray[2]}`,
                                    })}
                                    onClick={handleGoToNextMetric}
                                    disabled={!nextMetricInList}
                                >
                                    <MantineIcon icon={IconChevronDown} />
                                </ActionIcon>
                            </Tooltip>
                        </Group>
                        <Text fw={600} fz="md" color="ldGray.8">
                            {metricQuery.data?.label}
                        </Text>
                        <Tooltip
                            label={metricQuery.data?.description}
                            disabled={!metricQuery.data?.description}
                        >
                            <MantineIcon
                                color="ldGray.5"
                                icon={IconInfoCircle}
                                size={18}
                            />
                        </Tooltip>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body
                    p={0}
                    h="80vh"
                    sx={{ display: 'flex', flex: 1 }}
                    miw={800}
                    mih={600}
                >
                    <Stack w={460}>
                        <Stack
                            spacing="xl"
                            w="100%"
                            sx={{ flexGrow: 1 }}
                            px="lg"
                            py="md"
                        >
                            <MetricExploreFilter
                                dimensions={availableFilters}
                                onFilterApply={handleFilterApply}
                                key={`${tableName}-${metricName}`}
                            />
                            <MetricExploreSegmentationPicker
                                query={query}
                                onSegmentDimensionChange={
                                    handleSegmentDimensionChange
                                }
                                segmentByData={segmentByData}
                                segmentDimensionsQuery={segmentDimensionsQuery}
                                hasFilteredSeries={
                                    !!metricResultsQuery.isSuccess &&
                                    metricResultsQuery.data.hasFilteredSeries
                                }
                            />
                            <Divider color="ldGray.2" />
                            <Stack spacing="xs">
                                <Group position="apart">
                                    <Text fw={500} c="ldGray.7">
                                        Comparison
                                    </Text>

                                    <Button
                                        variant="subtle"
                                        compact
                                        color="dark"
                                        size="xs"
                                        radius="md"
                                        sx={(theme) => ({
                                            visibility:
                                                query.comparison ===
                                                MetricExplorerComparison.NONE
                                                    ? 'hidden'
                                                    : 'visible',
                                            '&:hover': {
                                                backgroundColor:
                                                    theme.colors.ldGray[1],
                                            },
                                        })}
                                        onClick={() =>
                                            setQuery({
                                                comparison:
                                                    MetricExplorerComparison.NONE,
                                                segmentDimension: null,
                                            })
                                        }
                                        rightIcon={
                                            <MantineIcon
                                                icon={IconX}
                                                color="ldGray.5"
                                                size={12}
                                            />
                                        }
                                        styles={{
                                            rightIcon: {
                                                marginLeft: 4,
                                            },
                                        }}
                                    >
                                        Clear
                                    </Button>
                                </Group>

                                <MetricExploreComparison
                                    baseMetricLabel={metricQuery.data?.label}
                                    query={query}
                                    onQueryChange={setQuery}
                                    metricsWithTimeDimensionsQuery={
                                        metricsWithTimeDimensionsQuery
                                    }
                                />
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider orientation="vertical" color="ldGray.2" />

                    <Box w="100%" py="xl" px="xxl">
                        <MetricsVisualization
                            query={query}
                            dateRange={dateRange ?? undefined}
                            results={metricResultsQuery.data}
                            onDateRangeChange={setDateRange}
                            showTimeDimensionIntervalPicker={
                                !!timeDimensionBaseField
                            }
                            timeDimensionBaseField={
                                timeDimensionBaseField ??
                                ({} as TimeDimensionConfig)
                            }
                            setTimeDimensionOverride={setTimeDimensionOverride}
                            onTimeIntervalChange={handleTimeIntervalChange}
                            isFetching={
                                metricResultsQuery.isFetching ||
                                metricResultsQuery.isLoading
                            }
                        />
                    </Box>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
