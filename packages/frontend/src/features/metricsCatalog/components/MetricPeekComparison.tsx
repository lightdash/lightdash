import {
    getItemId,
    MetricExplorerComparison,
    type MetricWithAssociatedTimeDimension,
} from '@lightdash/common';
import { Box, Group, Paper, Radio, Select, Stack, Text } from '@mantine/core';
import {
    IconCalendar,
    IconChevronDown,
    IconStack,
    IconTable,
} from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import {
    forwardRef,
    useCallback,
    type ComponentPropsWithoutRef,
    type FC,
} from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

type Props = {
    comparisonType: MetricExplorerComparison;
    setComparisonType: (type: MetricExplorerComparison) => void;
    handleComparisonTypeChange: (type: MetricExplorerComparison) => void;
    metricsWithTimeDimensionsQuery: UseQueryResult<
        MetricWithAssociatedTimeDimension[],
        unknown
    >;
    selectedMetric: MetricWithAssociatedTimeDimension | null;
    handleMetricChange: (metric: string | null) => void;
};

const FieldItem = forwardRef<
    HTMLDivElement,
    ComponentPropsWithoutRef<'div'> & {
        value: string;
        label: string;
        tableLabel: string;
        selected: boolean;
    }
>(({ value, label, tableLabel, ...others }, ref) => (
    <Box ref={ref} {...others}>
        <Group noWrap position="apart">
            <Text fz="sm" c="dark.8" fw={500}>
                {label}
            </Text>
            <Group spacing={4} noWrap>
                <MantineIcon color="gray.6" size={12} icon={IconTable} />
                <Text fz="xs" c="gray.6" span>
                    {tableLabel}
                </Text>
            </Group>
        </Group>
    </Box>
));

export const MetricPeekComparison: FC<Props> = ({
    comparisonType,
    setComparisonType,
    handleComparisonTypeChange,
    metricsWithTimeDimensionsQuery,
    selectedMetric,
    handleMetricChange,
}) => {
    const showMetricSelect = useCallback(
        (ct: MetricExplorerComparison) => {
            return (
                metricsWithTimeDimensionsQuery.isSuccess &&
                comparisonType === MetricExplorerComparison.DIFFERENT_METRIC &&
                ct === MetricExplorerComparison.DIFFERENT_METRIC
            );
        },
        [metricsWithTimeDimensionsQuery, comparisonType],
    );

    return (
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
                            '&[data-with-border="true"]': {
                                border:
                                    comparisonType === comparison.type
                                        ? `1px solid ${theme.colors.indigo[5]}`
                                        : `1px solid ${theme.colors.gray[2]}`,
                            },
                            '&:hover': {
                                backgroundColor: theme.colors.gray[0],
                            },
                            backgroundColor:
                                comparisonType === comparison.type
                                    ? theme.fn.lighten(
                                          theme.colors.gray[1],
                                          0.3,
                                      )
                                    : 'white',
                        })}
                        onClick={() => setComparisonType(comparison.type)}
                    >
                        <Stack>
                            <Group align="center" noWrap>
                                <Paper p="xs">
                                    <MantineIcon icon={comparison.icon} />
                                </Paper>

                                <Text color="dark.8" fw={500}>
                                    {comparison.label}
                                </Text>

                                <Radio
                                    value={comparison.type}
                                    size="xs"
                                    color="indigo"
                                />
                            </Group>

                            {showMetricSelect(comparison.type) && (
                                <Select
                                    placeholder="Select a metric"
                                    radius="md"
                                    size="xs"
                                    data={
                                        metricsWithTimeDimensionsQuery.data?.map(
                                            (metric) => ({
                                                value: getItemId(metric),
                                                label: metric.label,
                                                tableLabel: metric.tableLabel,
                                            }),
                                        ) ?? []
                                    }
                                    value={
                                        selectedMetric
                                            ? getItemId(selectedMetric)
                                            : null
                                    }
                                    onChange={handleMetricChange}
                                    disabled={
                                        !metricsWithTimeDimensionsQuery.isSuccess
                                    }
                                    itemComponent={FieldItem}
                                    rightSection={
                                        <MantineIcon
                                            color="dark.2"
                                            icon={IconChevronDown}
                                            size={12}
                                        />
                                    }
                                    styles={(theme) => ({
                                        input: {
                                            fontWeight: 500,
                                            fontSize: 14,
                                            borderColor: theme.colors.gray[2],
                                            borderRadius: theme.radius.md,
                                            boxShadow: theme.shadows.subtle,
                                            padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
                                            backgroundColor: 'white',
                                            '&:hover': {
                                                backgroundColor:
                                                    theme.fn.lighten(
                                                        theme.colors.gray[0],
                                                        0.5,
                                                    ),
                                            },
                                            height: 36,
                                            '&[value=""]': {
                                                border: `1px dashed ${theme.colors.gray[4]}`,
                                            },
                                        },
                                        item: {
                                            '&[data-selected="true"]': {
                                                color: theme.colors.gray[7],
                                                fontWeight: 500,
                                                backgroundColor:
                                                    theme.colors.gray[0],
                                            },
                                            '&[data-selected="true"]:hover': {
                                                backgroundColor:
                                                    theme.colors.gray[0],
                                            },
                                            '&:hover': {
                                                backgroundColor:
                                                    theme.colors.gray[0],
                                            },
                                        },
                                        dropdown: {
                                            minWidth: 'fit-content',
                                        },
                                        rightSection: { pointerEvents: 'none' },
                                    })}
                                />
                            )}
                        </Stack>
                    </Paper>
                ))}
            </Stack>
        </Radio.Group>
    );
};
