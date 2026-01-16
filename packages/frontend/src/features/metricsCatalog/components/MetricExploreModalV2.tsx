import {
    MetricExplorerComparison,
    getDefaultDateRangeFromInterval,
    isDimension,
    type CatalogField,
    type FilterRule,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type TimeDimensionConfig,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Center,
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
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';

type Props = Pick<ModalProps, 'opened' | 'onClose'> & {
    metrics: CatalogField[];
};

/**
 * V2: New MetricExploreModal implementation using echarts via VisualizationProvider
 * This is enabled when the MetricsCatalogEchartsVisualization feature flag is ON
 *
 * TODO: Replace placeholder visualization with VisualizationProvider + LightdashVisualization
 */
export const MetricExploreModalV2: FC<Props> = ({
    opened,
    onClose,
    metrics,
}) => {
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
                    <Divider orientation="vertical" color="ldGray.2" />

                    {/* TODO: Replace with VisualizationProvider + LightdashVisualization */}
                    <Box w="100%" py="xl" px="xxl">
                        <Center
                            h="100%"
                            sx={(theme) => ({
                                backgroundColor: theme.colors.ldGray[0],
                                borderRadius: theme.radius.md,
                                border: `2px dashed ${theme.colors.ldGray[3]}`,
                            })}
                        >
                            <Stack align="center" spacing="xs">
                                <Text c="ldGray.5" fw={500} fz="lg">
                                    V2 Visualization Placeholder
                                </Text>
                                <Text c="ldGray.4" fz="sm">
                                    ECharts via VisualizationProvider coming
                                    soon
                                </Text>
                            </Stack>
                        </Center>
                    </Box>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
