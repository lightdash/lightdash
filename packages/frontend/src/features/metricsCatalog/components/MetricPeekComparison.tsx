import {
    assertUnreachable,
    getItemId,
    MetricExplorerComparison,
    type MetricExplorerQuery,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import {
    Box,
    Group,
    Loader,
    Paper,
    Radio,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCalendar, IconChevronDown, IconStack } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import {
    forwardRef,
    useCallback,
    type ComponentPropsWithoutRef,
    type FC,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useSelectStyles } from '../styles/useSelectStyles';

type Props = {
    baseMetricLabel: string | undefined;
    query: MetricExplorerQuery;
    onQueryChange: (query: MetricExplorerQuery) => void;
    metricsWithTimeDimensionsQuery: UseQueryResult<
        MetricWithAssociatedTimeDimension[],
        unknown
    >;
};

const FieldItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: string;
        label: string;
        selected: boolean;
    }
>(({ value, label, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Text fz="sm" c="dark.8" fw={500}>
            {label}
        </Text>
    </Box>
));

export const MetricPeekComparison: FC<Props> = ({
    baseMetricLabel,
    query,
    onQueryChange,
    metricsWithTimeDimensionsQuery,
}) => {
    const { classes } = useSelectStyles();

    const handleComparisonChange = useCallback(
        (newComparison: MetricExplorerComparison) => {
            switch (newComparison) {
                case MetricExplorerComparison.NONE:
                    return onQueryChange({
                        comparison: newComparison,
                        segmentDimension: null,
                    });
                case MetricExplorerComparison.DIFFERENT_METRIC:
                    return onQueryChange({
                        comparison: newComparison,
                        metric: {
                            table: '',
                            name: '',
                            label: '',
                        },
                    });
                case MetricExplorerComparison.PREVIOUS_PERIOD:
                    return onQueryChange({
                        comparison: newComparison,
                    });
                default:
                    return assertUnreachable(
                        newComparison,
                        `Unsupported comparison type: ${newComparison}`,
                    );
            }
        },
        [onQueryChange],
    );

    const handleMetricChange = useCallback(
        (metricId: string | null) => {
            if (!metricsWithTimeDimensionsQuery.isSuccess) return;

            const metric = metricId
                ? metricsWithTimeDimensionsQuery.data.find(
                      (m) => getItemId(m) === metricId,
                  )
                : null;

            onQueryChange({
                comparison: MetricExplorerComparison.DIFFERENT_METRIC,
                metric: {
                    table: metric?.table ?? '',
                    name: metric?.name ?? '',
                    label: metric?.label ?? '',
                },
            });
        },
        [
            metricsWithTimeDimensionsQuery.data,
            metricsWithTimeDimensionsQuery.isSuccess,
            onQueryChange,
        ],
    );

    return (
        <Radio.Group value={query.comparison} onChange={handleComparisonChange}>
            <Stack spacing="sm">
                {[
                    {
                        type: MetricExplorerComparison.PREVIOUS_PERIOD,
                        icon: IconCalendar,
                        label: 'Compare to previous year',
                        tooltipLabel:
                            'Show data from the same period in the previous year',
                    },
                    {
                        type: MetricExplorerComparison.DIFFERENT_METRIC,
                        icon: IconStack,
                        label: 'Compare to another metric',
                        tooltipLabel: `Compare "${baseMetricLabel}" to another metric`,
                    },
                ].map((comparison) => (
                    <Tooltip
                        key={comparison.type}
                        label={comparison.tooltipLabel}
                        variant="xs"
                        position="right"
                        withinPortal
                    >
                        <Paper
                            px="md"
                            py="sm"
                            sx={(theme) => ({
                                cursor: 'pointer',
                                '&[data-with-border="true"]': {
                                    border:
                                        query.comparison === comparison.type
                                            ? `1px solid ${theme.colors.indigo[5]}`
                                            : `1px solid ${theme.colors.gray[2]}`,
                                },
                                '&:hover': {
                                    backgroundColor: theme.colors.gray[0],
                                },
                                backgroundColor:
                                    query.comparison === comparison.type
                                        ? theme.fn.lighten(
                                              theme.colors.gray[1],
                                              0.3,
                                          )
                                        : 'white',
                            })}
                            onClick={() =>
                                handleComparisonChange(comparison.type)
                            }
                        >
                            <Stack>
                                <Group align="center" noWrap position="apart">
                                    <Group>
                                        <Paper p="xs">
                                            <MantineIcon
                                                icon={comparison.icon}
                                            />
                                        </Paper>

                                        <Text color="dark.8" fw={500}>
                                            {comparison.label}
                                        </Text>
                                    </Group>
                                    <Radio value={comparison.type} size="xs" />
                                </Group>

                                {comparison.type ===
                                    MetricExplorerComparison.DIFFERENT_METRIC &&
                                    query.comparison ===
                                        MetricExplorerComparison.DIFFERENT_METRIC && (
                                        <Select
                                            placeholder="Select a metric"
                                            radius="md"
                                            size="xs"
                                            data={
                                                metricsWithTimeDimensionsQuery.data?.map(
                                                    (metric) => ({
                                                        value: getItemId(
                                                            metric,
                                                        ),
                                                        label: metric.label,
                                                    }),
                                                ) ?? []
                                            }
                                            value={
                                                query.comparison ===
                                                MetricExplorerComparison.DIFFERENT_METRIC
                                                    ? getItemId(query.metric)
                                                    : null
                                            }
                                            onChange={handleMetricChange}
                                            disabled={
                                                !metricsWithTimeDimensionsQuery.isSuccess
                                            }
                                            itemComponent={FieldItem}
                                            rightSection={
                                                metricsWithTimeDimensionsQuery.isLoading ? (
                                                    <Loader size="xs" />
                                                ) : (
                                                    <MantineIcon
                                                        color="dark.2"
                                                        icon={IconChevronDown}
                                                        size={12}
                                                    />
                                                )
                                            }
                                            classNames={{
                                                input: classes.input,
                                                item: classes.item,
                                                rightSection:
                                                    classes.rightSection,
                                            }}
                                        />
                                    )}
                            </Stack>
                        </Paper>
                    </Tooltip>
                ))}
            </Stack>
        </Radio.Group>
    );
};
