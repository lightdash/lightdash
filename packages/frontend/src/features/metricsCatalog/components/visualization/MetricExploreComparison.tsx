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
    Stack,
    Text,
    Select,
    Tooltip,
} from '@mantine-8/core';
import { IconCalendar, IconStack } from '@tabler/icons-react';
import { type UseQueryResult } from '@tanstack/react-query';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { groupComboboxItems } from '../../../../components/common/Select/utils';
import selectStyles from '../../styles/selectStyles.module.css';
import SelectItem from '../SelectItem';
import comparisonStyles from './MetricExploreComparison.module.css';

type Props = {
    baseMetricLabel: string | undefined;
    query: MetricExplorerQuery;
    onQueryChange: (query: MetricExplorerQuery) => void;
    metricsWithTimeDimensionsQuery: UseQueryResult<
        MetricWithAssociatedTimeDimension[],
        unknown
    >;
    canCompareToAnotherMetric?: boolean;
};

export const MetricExploreComparison: FC<Props> = ({
    baseMetricLabel,
    query,
    onQueryChange,
    metricsWithTimeDimensionsQuery,
    canCompareToAnotherMetric = true,
}) => {
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
        <Radio.Group
            value={query.comparison}
            onChange={(value) =>
                handleComparisonChange(value as MetricExplorerComparison)
            }
        >
            <Stack gap="sm">
                {[
                    {
                        type: MetricExplorerComparison.PREVIOUS_PERIOD,
                        icon: IconCalendar,
                        label: 'Compare to previous year',
                        tooltipLabel:
                            'Show data from the same period in the previous year',
                    },
                    canCompareToAnotherMetric
                        ? {
                              type: MetricExplorerComparison.DIFFERENT_METRIC,
                              icon: IconStack,
                              label: 'Compare to another metric',
                              tooltipLabel: `Compare "${baseMetricLabel}" to another metric`,
                          }
                        : null,
                ]
                    .filter(
                        (
                            comparison,
                        ): comparison is NonNullable<typeof comparison> =>
                            comparison !== null,
                    )
                    .map((comparison) => (
                        <Tooltip
                            key={comparison.type}
                            label={comparison.tooltipLabel}
                            position="right"
                            withinPortal
                        >
                            <Paper
                                p="sm"
                                withBorder
                                radius="md"
                                className={comparisonStyles.comparisonPaper}
                                data-selected={
                                    query.comparison === comparison.type ||
                                    undefined
                                }
                                onClick={() =>
                                    handleComparisonChange(comparison.type)
                                }
                            >
                                <Stack>
                                    <Group
                                        align="center"
                                        wrap="nowrap"
                                        justify="space-between"
                                    >
                                        <Group wrap="nowrap">
                                            <Paper
                                                p="xs"
                                                radius="md"
                                                withBorder
                                            >
                                                <MantineIcon
                                                    icon={comparison.icon}
                                                />
                                            </Paper>

                                            <Text fz="sm" c="ldGray.7" fw={500}>
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
                                                allowDeselect={false}
                                                placeholder="Select a metric"
                                                searchable
                                                radius="md"
                                                size="xs"
                                                data={groupComboboxItems(
                                                    metricsWithTimeDimensionsQuery.data?.map(
                                                        (metric) => ({
                                                            value: getItemId(
                                                                metric,
                                                            ),
                                                            label: metric.label,
                                                            group: metric.tableLabel,
                                                        }),
                                                    ) ?? [],
                                                )}
                                                value={getItemId(query.metric)}
                                                onChange={handleMetricChange}
                                                renderOption={({
                                                    option,
                                                    checked,
                                                }) => (
                                                    <SelectItem
                                                        value={option.value}
                                                        label={option.label}
                                                        selected={
                                                            checked ?? false
                                                        }
                                                    />
                                                )}
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
                                                    input: selectStyles.input,
                                                    option: selectStyles.option,
                                                    section:
                                                        selectStyles.rightSection,
                                                    dropdown:
                                                        selectStyles.dropdown,
                                                }}
                                            />
                                        ) : (
                                            <Text span c="ldGray.7" fz={13}>
                                                Only metrics with a time
                                                dimension defined in the .yml
                                                can be compared.{' '}
                                                <Anchor
                                                    inherit
                                                    c="ldGray.9"
                                                    fw={500}
                                                    target="_blank"
                                                    href="https://docs.lightdash.com/guides/metrics-catalog/catalog#configuring-default-time-settings-in-yml"
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
