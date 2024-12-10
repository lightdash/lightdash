import {
    getItemId,
    MetricExplorerComparison,
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
    comparisonType,
    setComparisonType,
    handleComparisonTypeChange,
    metricsWithTimeDimensionsQuery,
    selectedMetric,
    handleMetricChange,
}) => {
    const { classes } = useSelectStyles();
    const showMetricSelect = useCallback(
        (ct: MetricExplorerComparison) => {
            return (
                comparisonType === MetricExplorerComparison.DIFFERENT_METRIC &&
                ct === MetricExplorerComparison.DIFFERENT_METRIC
            );
        },
        [comparisonType],
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
                            <Group align="center" noWrap position="apart">
                                <Group>
                                    <Paper p="xs">
                                        <MantineIcon icon={comparison.icon} />
                                    </Paper>

                                    <Text color="dark.8" fw={500}>
                                        {comparison.label}
                                    </Text>
                                </Group>
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
                                        rightSection: classes.rightSection,
                                    }}
                                />
                            )}
                        </Stack>
                    </Paper>
                ))}
            </Stack>
        </Radio.Group>
    );
};
