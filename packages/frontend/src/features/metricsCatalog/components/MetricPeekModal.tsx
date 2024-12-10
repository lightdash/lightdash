import {
    assertUnreachable,
    getDefaultDateRangeFromInterval,
    getItemId,
    isDimension,
    MetricExplorerComparison,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
    type MetricWithAssociatedTimeDimension,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    LoadingOverlay,
    Modal,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCatalogMetricsWithTimeDimensions } from '../hooks/useCatalogMetricsWithTimeDimensions';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';
import { MetricPeekComparison } from './MetricPeekComparison';
import MetricsVisualization from './visualization/MetricsVisualization';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const MetricPeekModal: FC<Props> = ({ opened, onClose }) => {
    const projectUuid = useAppSelector(
        (state) => state.metricsCatalog.projectUuid,
    );

    const { tableName, metricName } = useParams<{
        tableName: string;
        metricName: string;
    }>();

    const history = useHistory();

    const metricQuery = useMetric({
        projectUuid,
        tableName,
        metricName,
    });

    const [comparisonType, setComparisonType] =
        useState<MetricExplorerComparison>(MetricExplorerComparison.NONE);

    const [dateRange, setDateRange] = useState<MetricExplorerDateRange | null>(
        null,
    );

    const [timeDimensionOverride, setTimeDimensionOverride] = useState<
        TimeDimensionConfig | undefined
    >();

    const metricsWithTimeDimensionsQuery = useCatalogMetricsWithTimeDimensions({
        projectUuid,
        options: {
            enabled:
                comparisonType === MetricExplorerComparison.DIFFERENT_METRIC,
        },
    });

    const [selectedMetric, setSelectedMetric] =
        useState<MetricWithAssociatedTimeDimension | null>(null);

    const handleMetricChange = useCallback(
        (metricId: string | null) => {
            if (!metricsWithTimeDimensionsQuery.isSuccess) return;

            if (!metricId) {
                setSelectedMetric(null);
                return;
            }

            const metric = metricsWithTimeDimensionsQuery.data.find(
                (m) => getItemId(m) === metricId,
            );

            setSelectedMetric(metric ?? null);
        },
        [
            metricsWithTimeDimensionsQuery.data,
            metricsWithTimeDimensionsQuery.isSuccess,
        ],
    );

    const handleComparisonTypeChange = useCallback(
        (value: MetricExplorerComparison) => {
            setComparisonType(value);

            if (
                value === MetricExplorerComparison.NONE ||
                value === MetricExplorerComparison.PREVIOUS_PERIOD
            ) {
                setSelectedMetric(null);
            }

            if (value === MetricExplorerComparison.NONE) {
                setDateRange(null);
                setTimeDimensionOverride(undefined);
            } else if (timeDimensionOverride) {
                setDateRange(
                    getDefaultDateRangeFromInterval(
                        timeDimensionOverride.interval,
                    ),
                );
            }
        },
        [timeDimensionOverride],
    );

    const comparisonParams = useMemo((): MetricExplorerComparisonType => {
        switch (comparisonType) {
            case MetricExplorerComparison.NONE:
                return {
                    type: MetricExplorerComparison.NONE,
                };
            case MetricExplorerComparison.PREVIOUS_PERIOD:
                return {
                    type: MetricExplorerComparison.PREVIOUS_PERIOD,
                };
            case MetricExplorerComparison.DIFFERENT_METRIC:
                if (!selectedMetric) {
                    return {
                        type: MetricExplorerComparison.NONE,
                    };
                }

                return {
                    type: MetricExplorerComparison.DIFFERENT_METRIC,
                    metricTable: selectedMetric.table,
                    metricName: selectedMetric.name,
                };
            default:
                return assertUnreachable(
                    comparisonType,
                    `Unknown comparison type: ${comparisonType}`,
                );
        }
    }, [comparisonType, selectedMetric]);

    const metricExplorerQueryOptions = {
        enabled:
            !!projectUuid &&
            !!tableName &&
            !!metricName &&
            !!comparisonParams &&
            !!dateRange &&
            (comparisonParams.type !==
                MetricExplorerComparison.DIFFERENT_METRIC ||
                (comparisonParams.type ===
                    MetricExplorerComparison.DIFFERENT_METRIC &&
                    !!comparisonParams.metricName &&
                    !!comparisonParams.metricTable)),
        keepPreviousData: true,
    };
    const metricResultsQuery = useRunMetricExplorerQuery({
        projectUuid,
        exploreName: tableName,
        metricName,
        dateRange: dateRange ?? undefined,
        comparison: comparisonParams,
        timeDimensionOverride,
        options: metricExplorerQueryOptions,
    });

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
        [timeDimensionOverride, timeDimensionBaseField, dateRange],
    );

    const handleTimeIntervalChange = useCallback(
        function handleTimeIntervalChange(timeInterval: TimeFrames) {
            // Always reset the date range to the default range for the new interval
            setDateRange(getDefaultDateRangeFromInterval(timeInterval));

            if (timeDimensionBaseField) {
                setTimeDimensionOverride({
                    ...timeDimensionBaseField,
                    interval: timeInterval,
                });
            }
        },
        [timeDimensionBaseField],
    );

    const handleClose = useCallback(() => {
        history.push(`/projects/${projectUuid}/metrics`);
        setComparisonType(MetricExplorerComparison.NONE);
        setDateRange(null);
        setTimeDimensionOverride(undefined);
        setSelectedMetric(null);
        onClose();
    }, [history, onClose, projectUuid]);

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
                />
                <Modal.Header
                    h={52}
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    })}
                >
                    <Group spacing="xs">
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
                    <Stack py="md" px="lg" bg="offWhite.0" miw={340}>
                        <Stack spacing="xl">
                            <Stack w="100%" spacing="xs" sx={{ flexGrow: 1 }}>
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
                                        sx={{
                                            visibility:
                                                comparisonType ===
                                                MetricExplorerComparison.NONE
                                                    ? 'hidden'
                                                    : 'visible',
                                        }}
                                        onClick={() =>
                                            setComparisonType(
                                                MetricExplorerComparison.NONE,
                                            )
                                        }
                                    >
                                        Clear
                                    </Button>
                                </Group>

                                <MetricPeekComparison
                                    comparisonType={comparisonType}
                                    setComparisonType={setComparisonType}
                                    handleComparisonTypeChange={
                                        handleComparisonTypeChange
                                    }
                                    handleMetricChange={handleMetricChange}
                                    metricsWithTimeDimensionsQuery={
                                        metricsWithTimeDimensionsQuery
                                    }
                                    selectedMetric={selectedMetric}
                                />
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider orientation="vertical" color="gray.2" />

                    <Box w="100%" py="xl" px="xxl">
                        <MetricsVisualization
                            comparison={comparisonParams}
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
