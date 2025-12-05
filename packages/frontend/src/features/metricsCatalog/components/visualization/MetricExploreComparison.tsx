import {
    assertUnreachable,
    getItemId,
    MetricExplorerComparison,
    type MetricExplorerQuery,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import {
    Anchor,
    Group,
    Loader,
    Paper,
    Radio,
    Select,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconCalendar, IconStack } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useSelectStyles } from '../../styles/useSelectStyles';
import SelectItem from '../SelectItem';

type Props = {
    baseMetricLabel: string | undefined;
    query: MetricExplorerQuery;
    onQueryChange: (query: MetricExplorerQuery) => void;
    metricsWithTimeDimensionsQuery: UseQueryResult<
        MetricWithAssociatedTimeDimension[],
        unknown
    >;
};

export const MetricExploreComparison: FC<Props> = ({
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
                            p="sm"
                            withBorder
                            radius="md"
                            sx={(theme) => ({
                                cursor: 'pointer',
                                transition: `all ${theme.other.transitionDuration}ms ${theme.other.transitionTimingFunction}`,
                                '&[data-with-border="true"]': {
                                    border:
                                        query.comparison === comparison.type
                                            ? `1px solid ${theme.colors.indigo[5]}`
                                            : `1px solid ${theme.colors.ldGray[2]}`,
                                },
                                '&:hover': {
                                    backgroundColor:
                                        theme.colorScheme === 'dark'
                                            ? theme.colors.ldDark[3]
                                            : theme.colors.ldGray[0],
                                },
                                backgroundColor:
                                    query.comparison === comparison.type
                                        ? theme.colorScheme === 'dark'
                                            ? theme.colors.ldDark[2]
                                            : theme.fn.lighten(
                                                  theme.colors.ldGray[1],
                                                  0.3,
                                              )
                                        : theme.colors.background[0],
                            })}
                            onClick={() =>
                                handleComparisonChange(comparison.type)
                            }
                        >
                            <Stack>
                                <Group align="center" noWrap position="apart">
                                    <Group noWrap>
                                        <Paper p="xs" radius="md" withBorder>
                                            <MantineIcon
                                                icon={comparison.icon}
                                            />
                                        </Paper>

                                        <Text color="ldGray.7" fw={500}>
                                            {comparison.label}
                                        </Text>
                                    </Group>
                                    <Radio
                                        value={comparison.type}
                                        size="xs"
                                        color="indigo"
                                    />
                                </Group>

                                {comparison.type ===
                                    MetricExplorerComparison.DIFFERENT_METRIC &&
                                    query.comparison ===
                                        MetricExplorerComparison.DIFFERENT_METRIC &&
                                    (metricsWithTimeDimensionsQuery.isLoading ||
                                    (metricsWithTimeDimensionsQuery.isSuccess &&
                                        metricsWithTimeDimensionsQuery.data
                                            .length > 0) ? (
                                        <Select
                                            placeholder="Select a metric"
                                            searchable
                                            radius="md"
                                            size="xs"
                                            data={
                                                metricsWithTimeDimensionsQuery.data?.map(
                                                    (metric) => ({
                                                        value: getItemId(
                                                            metric,
                                                        ),
                                                        label: metric.label,
                                                        group: metric.tableLabel,
                                                    }),
                                                ) ?? []
                                            }
                                            value={getItemId(query.metric)}
                                            onChange={handleMetricChange}
                                            itemComponent={SelectItem}
                                            // this does not work as expected in Mantine 6
                                            data-disabled={
                                                !metricsWithTimeDimensionsQuery.isSuccess
                                            }
                                            rightSection={
                                                metricsWithTimeDimensionsQuery.isLoading ? (
                                                    <Loader
                                                        size="xs"
                                                        color="ldGray.5"
                                                    />
                                                ) : undefined
                                            }
                                            classNames={{
                                                input: classes.input,
                                                item: classes.item,
                                                rightSection:
                                                    classes.rightSection,
                                                dropdown: classes.dropdown,
                                            }}
                                        />
                                    ) : (
                                        <Text span c="ldGray.7" fz={13}>
                                            Only metrics with a time dimension
                                            defined in the .yml can be compared.{' '}
                                            <Anchor
                                                c="ldGray.9"
                                                fw={500}
                                                target="_blank"
                                                href="https://docs.lightdash.com/guides/metrics-catalog/#configuring-default-time-settings-in-yml"
                                            >
                                                Learn more
                                            </Anchor>
                                        </Text>
                                    ))}
                            </Stack>
                        </Paper>
                    </Tooltip>
                ))}
            </Stack>
        </Radio.Group>
    );
};
