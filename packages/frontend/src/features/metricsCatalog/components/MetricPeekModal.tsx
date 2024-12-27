import {
    getDefaultDateRangeFromInterval,
    getItemId,
    isDimension,
    MetricExplorerComparison,
    type CatalogField,
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
} from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import {
    IconChevronDown,
    IconChevronUp,
    IconInfoCircle,
    IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCatalogMetricsWithTimeDimensions } from '../hooks/useCatalogMetricsWithTimeDimensions';
import { useCatalogSegmentDimensions } from '../hooks/useCatalogSegmentDimensions';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';
import { MetricPeekComparison } from './visualization/MetricPeekComparison';
import { MetricPeekSegmentationPicker } from './visualization/MetricPeekSegmentationPicker';
import MetricsVisualization from './visualization/MetricsVisualization';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
};

export const MetricPeekModal: FC<Props> = ({ opened, onClose, metrics }) => {
    const { track } = useTracking();

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

    const history = useHistory();

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

    const resetQueryState = useCallback(() => {
        setQuery({
            comparison: MetricExplorerComparison.NONE,
            segmentDimension: null,
        });
        setTimeDimensionOverride(undefined);
        setDateRange(null);
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
            history.push({
                pathname: `/projects/${projectUuid}/metrics/peek/${metric.tableName}/${metric.name}`,
                search: history.location.search,
            });

            resetQueryState();
        },
        [history, projectUuid, resetQueryState],
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
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    metricName,
                    tableName,
                    segmentDimension: value,
                },
            });
        },
        [metricName, organizationUuid, projectUuid, tableName, track],
    );

    const handleClose = useCallback(() => {
        history.push({
            pathname: `/projects/${projectUuid}/metrics`,
            search: history.location.search,
        });

        resetQueryState();

        onClose();
    }, [history, onClose, projectUuid, resetQueryState]);

    useEffect(() => {
        if (timeDimensionOverride) {
            track({
                name: EventName.METRICS_CATALOG_EXPLORE_TIME_DIMENSION_OVERRIDE_APPLIED,
                properties: {
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
    ]);

    useEffect(() => {
        if (query.comparison === MetricExplorerComparison.PREVIOUS_PERIOD) {
            track({
                name: EventName.METRICS_CATALOG_EXPLORE_COMPARE_LAST_PERIOD,
                properties: {
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
    ]);

    const segmentByData = useMemo(() => {
        return (
            segmentDimensionsQuery.data?.map((dimension) => ({
                value: getItemId(dimension),
                label: dimension.label,
            })) ?? []
        );
    }, [segmentDimensionsQuery.data]);

    useHotkeys([
        ['ArrowUp', () => handleGoToPreviousMetric()],
        ['ArrowDown', () => handleGoToNextMetric()],
    ]);

    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            scrollAreaComponent={undefined}
            size="auto"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius={12} w="100%">
                <LoadingOverlay
                    visible={
                        metricQuery.isLoading || metricResultsQuery.isLoading
                    }
                    overlayBlur={2}
                    loaderProps={{
                        size: 'md',
                        color: 'dark',
                        variant: 'dots',
                    }}
                />
                <Modal.Header
                    h={52}
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    })}
                >
                    <Group spacing="xs">
                        <Group spacing="xxs">
                            <ActionIcon
                                variant="outline"
                                size="sm"
                                radius="sm"
                                sx={(theme) => ({
                                    border: `1px solid ${theme.colors.gray[2]}`,
                                })}
                                onClick={handleGoToPreviousMetric}
                                disabled={!previousMetricInList}
                            >
                                <MantineIcon icon={IconChevronUp} />
                            </ActionIcon>
                            <ActionIcon
                                variant="outline"
                                size="sm"
                                radius="sm"
                                sx={(theme) => ({
                                    border: `1px solid ${theme.colors.gray[2]}`,
                                })}
                                onClick={handleGoToNextMetric}
                                disabled={!nextMetricInList}
                            >
                                <MantineIcon icon={IconChevronDown} />
                            </ActionIcon>
                        </Group>
                        <Text fw={600} fz="md" color="gray.8">
                            {metricQuery.data?.label}
                        </Text>
                        <Tooltip
                            label={metricQuery.data?.description}
                            disabled={!metricQuery.data?.description}
                        >
                            <MantineIcon
                                color="gray.5"
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
                    <Stack bg="offWhite.0" w={460}>
                        <Stack
                            spacing="xl"
                            w="100%"
                            sx={{ flexGrow: 1 }}
                            px="lg"
                            py="md"
                        >
                            <MetricPeekSegmentationPicker
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
                            <Divider color="gray.2" />
                            <Stack spacing="xs">
                                <Group position="apart">
                                    <Text fw={500} c="gray.7">
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
                                                    theme.colors.gray[1],
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
                                                color="gray.5"
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

                                <MetricPeekComparison
                                    baseMetricLabel={metricQuery.data?.label}
                                    query={query}
                                    onQueryChange={setQuery}
                                    metricsWithTimeDimensionsQuery={
                                        metricsWithTimeDimensionsQuery
                                    }
                                />
                            </Stack>
                        </Stack>
                        <Stack
                            p="lg"
                            spacing="xs"
                            align="center"
                            mt="auto"
                            sx={(theme) => ({
                                borderTop: `1px solid ${theme.colors.gray[2]}`,
                            })}
                        >
                            <Text size="xs" fw={500} color="gray.7">
                                Keyboard shortcuts
                            </Text>
                            <Text size="xs" color="gray.6">
                                <Kbd>↑</Kbd> <Kbd>↓</Kbd> to navigate between
                                metrics
                            </Text>
                        </Stack>
                    </Stack>

                    <Divider orientation="vertical" color="gray.2" />

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
