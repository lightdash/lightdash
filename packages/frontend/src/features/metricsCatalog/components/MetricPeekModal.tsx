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
    Paper,
    Radio,
    Select,
    Skeleton,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { IconCalendar, IconInfoCircle, IconStack } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCatalogMetricsWithTimeDimensions } from '../hooks/useCatalogMetricsWithTimeDimensions';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';
import MetricsVisualization from './visualization/MetricsVisualization';
import { TimeDimensionPicker } from './visualization/TimeDimensionPicker';

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

    const metricResultsQuery = useRunMetricExplorerQuery({
        projectUuid,
        exploreName: tableName,
        metricName,
        dateRange: dateRange ?? undefined,
        comparison: comparisonParams,
        timeDimensionOverride,
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

    const handleClose = useCallback(() => {
        history.push(`/projects/${projectUuid}/metrics`);
        setComparisonType(MetricExplorerComparison.NONE);
        setDateRange(null);
        setTimeDimensionOverride(undefined);
        setSelectedMetric(null);
        onClose();
    }, [history, onClose, projectUuid]);

    const handleTimeIntervalChange = useCallback(
        (timeInterval: TimeFrames) => {
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

    console.log({ timeDimensionOverride });
    return (
        <Modal.Root
            opened={opened}
            onClose={handleClose}
            scrollAreaComponent={undefined}
            size="auto"
        >
            <Modal.Overlay />
            <Modal.Content sx={{ overflow: 'hidden' }} radius="lg" w="100%">
                <LoadingOverlay
                    visible={
                        metricQuery.isLoading || metricResultsQuery.isLoading
                    }
                />
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: `${theme.spacing.md} ${theme.spacing.lg}`,
                    })}
                >
                    <Group spacing="xs">
                        <Text fw={600} fz="lg" color="dark.7">
                            {metricQuery.data?.label}
                        </Text>
                        <Tooltip
                            label={metricQuery.data?.description}
                            disabled={!metricQuery.data?.description}
                        >
                            <MantineIcon
                                color="dark.3"
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
                    <Stack p="xl" bg="offWhite.0" miw={360}>
                        <Stack spacing="xl">
                            {metricQuery.data?.availableTimeDimensions && (
                                <Stack
                                    w="100%"
                                    spacing="xs"
                                    align="flex-start"
                                    sx={{ flexGrow: 1 }}
                                >
                                    <Text fw={500} c="gray.7">
                                        X-axis
                                    </Text>
                                    {metricQuery.isSuccess &&
                                    timeDimensionBaseField ? (
                                        <TimeDimensionPicker
                                            fields={
                                                metricQuery.data
                                                    .availableTimeDimensions
                                            }
                                            dimension={timeDimensionBaseField}
                                            onChange={setTimeDimensionOverride}
                                        />
                                    ) : (
                                        <Skeleton w="100%" h={40} />
                                    )}
                                </Stack>
                            )}

                            <Divider
                                display={
                                    metricQuery.data?.availableTimeDimensions
                                        ? 'block'
                                        : 'none'
                                }
                                color="gray.2"
                            />

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

                                <Radio.Group
                                    value={comparisonType}
                                    onChange={handleComparisonTypeChange}
                                >
                                    <Stack spacing="sm">
                                        {[
                                            {
                                                type: MetricExplorerComparison.PREVIOUS_PERIOD,
                                                icon: IconCalendar,
                                                label: 'Compare to previous year',
                                            },
                                            {
                                                type: MetricExplorerComparison.DIFFERENT_METRIC,
                                                icon: IconStack,
                                                label: 'Compare to another metric',
                                            },
                                        ].map((comparison) => (
                                            <Paper
                                                key={comparison.type}
                                                px="md"
                                                py="sm"
                                                sx={(theme) => ({
                                                    cursor: 'pointer',
                                                    '&[data-with-border="true"]':
                                                        {
                                                            border:
                                                                comparisonType ===
                                                                comparison.type
                                                                    ? `1px solid ${theme.colors.indigo[5]}`
                                                                    : `1px solid ${theme.colors.gray[2]}`,
                                                        },
                                                })}
                                                onClick={() =>
                                                    setComparisonType(
                                                        comparison.type,
                                                    )
                                                }
                                            >
                                                <Stack>
                                                    <Group
                                                        align="center"
                                                        noWrap
                                                    >
                                                        <Paper p="xs">
                                                            <MantineIcon
                                                                icon={
                                                                    comparison.icon
                                                                }
                                                            />
                                                        </Paper>

                                                        <Stack
                                                            spacing={4}
                                                            style={{
                                                                flexGrow: 1,
                                                            }}
                                                        >
                                                            <Text
                                                                color="dark.8"
                                                                fw={500}
                                                            >
                                                                {
                                                                    comparison.label
                                                                }
                                                            </Text>
                                                        </Stack>

                                                        <Radio
                                                            value={
                                                                comparison.type
                                                            }
                                                            size="xs"
                                                            color="indigo"
                                                        />
                                                    </Group>

                                                    {metricsWithTimeDimensionsQuery.isSuccess &&
                                                        comparison.type ===
                                                            MetricExplorerComparison.DIFFERENT_METRIC &&
                                                        comparisonType ===
                                                            MetricExplorerComparison.DIFFERENT_METRIC && (
                                                            <Select
                                                                placeholder="Select metric"
                                                                radius="md"
                                                                size="xs"
                                                                data={
                                                                    metricsWithTimeDimensionsQuery.data?.map(
                                                                        (
                                                                            metric,
                                                                        ) => ({
                                                                            value: getItemId(
                                                                                metric,
                                                                            ),
                                                                            label: metric.label,
                                                                        }),
                                                                    ) ?? []
                                                                }
                                                                value={
                                                                    selectedMetric
                                                                        ? getItemId(
                                                                              selectedMetric,
                                                                          )
                                                                        : null
                                                                }
                                                                onChange={
                                                                    handleMetricChange
                                                                }
                                                                disabled={
                                                                    !metricsWithTimeDimensionsQuery.isSuccess
                                                                }
                                                            />
                                                        )}
                                                </Stack>
                                            </Paper>
                                        ))}
                                    </Stack>
                                </Radio.Group>
                            </Stack>
                        </Stack>
                    </Stack>

                    <Divider orientation="vertical" color="gray.2" />

                    <Box mih={500} w="100%" pt="sm" px="md">
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
                            isFetching={metricResultsQuery.isFetching}
                        />
                    </Box>
                </Modal.Body>
            </Modal.Content>
        </Modal.Root>
    );
};
