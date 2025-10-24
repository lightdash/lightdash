import { type ToolRunQueryArgsTransformed } from '@lightdash/common';
import { Badge, Group, Text } from '@mantine-8/core';
import type { FC } from 'react';
import { formatFieldName } from '../utils/formatFieldName';

type QueryResultToolCallDescriptionProps = Pick<
    ToolRunQueryArgsTransformed,
    | 'title'
    | 'queryConfig'
    | 'chartConfig'
    | 'customMetrics'
    | 'tableCalculations'
>;

export const QueryResultToolCallDescription: FC<
    QueryResultToolCallDescriptionProps
> = ({ title, queryConfig, chartConfig, customMetrics, tableCalculations }) => {
    const dimensions = queryConfig?.dimensions || [];
    const metrics = queryConfig?.metrics || [];
    const groupBy = chartConfig?.groupBy || [];
    const customMetricsArray = customMetrics || [];
    const tableCalculationsArray = tableCalculations || [];

    // Separate dimensions into regular dimensions and groupBy dimensions
    const regularDimensions = dimensions.filter(
        (dim: string) => !groupBy.includes(dim),
    );
    const groupByDimensions = groupBy;

    return (
        <Group gap={4} wrap="wrap">
            <Text c="dimmed" size="xs" fw={500}>
                "{title}"
            </Text>
            {metrics.length > 0 && (
                <>
                    <Text c="dimmed" size="xs">
                        shows
                    </Text>
                    {metrics.map((metric: string) => (
                        <Badge
                            key={metric}
                            color="gray"
                            variant="light"
                            size="xs"
                            radius="sm"
                            style={{
                                textTransform: 'none',
                                fontWeight: 400,
                            }}
                        >
                            {formatFieldName(metric)}
                        </Badge>
                    ))}
                </>
            )}
            {regularDimensions.length > 0 && (
                <>
                    <Text c="dimmed" size="xs">
                        by
                    </Text>
                    {regularDimensions.map((dim: string) => (
                        <Badge
                            key={dim}
                            color="gray"
                            variant="light"
                            size="xs"
                            radius="sm"
                            style={{
                                textTransform: 'none',
                                fontWeight: 400,
                            }}
                        >
                            {formatFieldName(dim)}
                        </Badge>
                    ))}
                </>
            )}
            {groupByDimensions.length > 0 && (
                <>
                    <Text c="dimmed" size="xs">
                        grouped by
                    </Text>
                    {groupByDimensions.map((dim: string) => (
                        <Badge
                            key={dim}
                            color="gray"
                            variant="light"
                            size="xs"
                            radius="sm"
                            style={{
                                textTransform: 'none',
                                fontWeight: 400,
                            }}
                        >
                            {formatFieldName(dim)}
                        </Badge>
                    ))}
                </>
            )}
            {customMetricsArray.length > 0 && (
                <Text c="dimmed" size="xs">
                    with {customMetricsArray.length} custom metric
                    {customMetricsArray.length !== 1 ? 's' : ''}
                </Text>
            )}
            {tableCalculationsArray.length > 0 && (
                <Text c="dimmed" size="xs">
                    {customMetricsArray.length > 0 ? 'and' : 'with'}{' '}
                    {tableCalculationsArray.length} calculation
                    {tableCalculationsArray.length !== 1 ? 's' : ''}
                </Text>
            )}
        </Group>
    );
};
