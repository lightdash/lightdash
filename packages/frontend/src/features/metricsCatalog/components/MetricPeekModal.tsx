import {
    getDefaultDateRangeFromInterval,
    getItemId,
    isDimension,
    MAX_SEGMENT_DIMENSION_UNIQUE_VALUES,
    MetricExplorerComparison,
    type MetricExplorerDateRange,
    type MetricExplorerQuery,
    type TimeDimensionConfig,
    type TimeFrames,
} from '@lightdash/common';
import {
    Alert,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    LoadingOverlay,
    Modal,
    Select,
    Stack,
    Text,
    Tooltip,
    type ModalProps,
} from '@mantine/core';
import { IconBoxAlignTopRight, IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppSelector } from '../../sqlRunner/store/hooks';
import { useCatalogMetricsWithTimeDimensions } from '../hooks/useCatalogMetricsWithTimeDimensions';
import { useCatalogSegmentDimensions } from '../hooks/useCatalogSegmentDimensions';
import { useMetric } from '../hooks/useMetricsCatalog';
import { useRunMetricExplorerQuery } from '../hooks/useRunMetricExplorerQuery';
import { useSelectStyles } from '../styles/useSelectStyles';
import { MetricPeekComparison } from './MetricPeekComparison';
import MetricsVisualization from './visualization/MetricsVisualization';

type Props = Pick<ModalProps, 'opened' | 'onClose'>;

export const MetricPeekModal: FC<Props> = ({ opened, onClose }) => {
    const { classes } = useSelectStyles();

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

    const metricResultsQuery = useRunMetricExplorerQuery(
        {
            projectUuid,
            exploreName: tableName,
            metricName,
            dateRange: dateRange ?? undefined,
            query,
            timeDimensionOverride,
        },
        {
            enabled:
                !!projectUuid &&
                !!tableName &&
                !!metricName &&
                !!query &&
                !!dateRange &&
                (query.comparison !==
                    MetricExplorerComparison.DIFFERENT_METRIC ||
                    (query.comparison ===
                        MetricExplorerComparison.DIFFERENT_METRIC &&
                        query.metric.name !== '' &&
                        query.metric.table !== '')),
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

    const handleSegmentDimensionChange = useCallback((value: string | null) => {
        setQuery({
            comparison: MetricExplorerComparison.NONE,
            segmentDimension: value,
        });
    }, []);

    const handleClose = useCallback(() => {
        history.push(`/projects/${projectUuid}/metrics`);

        setQuery({
            comparison: MetricExplorerComparison.NONE,
            segmentDimension: null,
        });
        setTimeDimensionOverride(undefined);
        setDateRange(null);

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
                    <Stack py="md" px="lg" bg="offWhite.0" w={460}>
                        <Stack spacing="xl">
                            <Stack w="100%" spacing="xs" sx={{ flexGrow: 1 }}>
                                <Text fw={500} c="gray.7">
                                    Segment
                                </Text>

                                <Select
                                    placeholder="Segment by"
                                    clearable
                                    icon={
                                        <MantineIcon
                                            icon={IconBoxAlignTopRight}
                                        />
                                    }
                                    radius="md"
                                    size="xs"
                                    data={
                                        segmentDimensionsQuery.data?.map(
                                            (dimension) => ({
                                                value: getItemId(dimension),
                                                label: dimension.label,
                                            }),
                                        ) ?? []
                                    }
                                    value={
                                        query.comparison ===
                                        MetricExplorerComparison.NONE
                                            ? query.segmentDimension
                                            : null
                                    }
                                    onChange={handleSegmentDimensionChange}
                                    // this does not work as expected in Mantine 6
                                    data-disabled={
                                        !segmentDimensionsQuery.isSuccess
                                    }
                                    rightSection={
                                        segmentDimensionsQuery.isLoading ? (
                                            <Loader size="xs" color="gray.5" />
                                        ) : undefined
                                    }
                                    classNames={{
                                        input: classes.input,
                                        item: classes.item,
                                    }}
                                />

                                {metricResultsQuery.isSuccess &&
                                    metricResultsQuery.data
                                        .hasFilteredSeries && (
                                        <Alert
                                            py="xs"
                                            px="sm"
                                            variant="light"
                                            color="yellow"
                                            sx={(theme) => ({
                                                borderStyle: 'dashed',
                                                borderWidth: 1,
                                                borderColor:
                                                    theme.colors.yellow[4],
                                            })}
                                        >
                                            <Text size="sm" color="gray.7">
                                                Only the first{' '}
                                                {
                                                    MAX_SEGMENT_DIMENSION_UNIQUE_VALUES
                                                }{' '}
                                                unique values of the segment
                                                dimension are shown.
                                            </Text>
                                        </Alert>
                                    )}

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
