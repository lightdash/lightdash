import {
    isCustomChartTypeSlugChartConfig,
    type ToolRunQueryArgs,
} from '@lightdash/common';
import { Group, Text } from '@mantine/core';
import type { FC } from 'react';
import { useTranslation } from 'react-i18next';
import { ToolCallChip } from '../ToolCallChip';
import { formatFieldName } from '../utils/formatFieldName';

type QueryResultToolCallDescriptionProps = {
    title: ToolRunQueryArgs['title'];
    queryConfig: ToolRunQueryArgs['queryConfig'];
    chartConfig: ToolRunQueryArgs['chartConfig'];
};

export const QueryResultToolCallDescription: FC<
    QueryResultToolCallDescriptionProps
> = ({ title, queryConfig, chartConfig }) => {
    const { t } = useTranslation('aiCopilotChat');
    const dimensions = queryConfig?.dimensions || [];
    const metrics = queryConfig?.metrics || [];
    const groupBy =
        (!isCustomChartTypeSlugChartConfig(chartConfig) &&
            chartConfig?.groupBy) ||
        [];
    const customMetricsArray = queryConfig?.customMetrics || [];
    const tableCalculationsArray = queryConfig?.tableCalculations || [];

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
                        {t('toolDescriptions.query.shows')}
                    </Text>
                    {metrics.map((metric: string) => (
                        <ToolCallChip key={metric}>
                            {formatFieldName(metric)}
                        </ToolCallChip>
                    ))}
                </>
            )}
            {regularDimensions.length > 0 && (
                <>
                    <Text c="dimmed" size="xs">
                        {t('toolDescriptions.query.by')}
                    </Text>
                    {regularDimensions.map((dim: string) => (
                        <ToolCallChip key={dim}>
                            {formatFieldName(dim)}
                        </ToolCallChip>
                    ))}
                </>
            )}
            {groupByDimensions.length > 0 && (
                <>
                    <Text c="dimmed" size="xs">
                        {t('toolDescriptions.query.groupedBy')}
                    </Text>
                    {groupByDimensions.map((dim: string) => (
                        <ToolCallChip key={dim}>
                            {formatFieldName(dim)}
                        </ToolCallChip>
                    ))}
                </>
            )}
            {customMetricsArray.length > 0 && (
                <Text c="dimmed" size="xs">
                    {t('toolDescriptions.query.withCustomMetrics', {
                        count: customMetricsArray.length,
                    })}
                </Text>
            )}
            {tableCalculationsArray.length > 0 && (
                <Text c="dimmed" size="xs">
                    {customMetricsArray.length > 0
                        ? t('toolDescriptions.query.andCalculations', {
                              count: tableCalculationsArray.length,
                          })
                        : t('toolDescriptions.query.withCalculations', {
                              count: tableCalculationsArray.length,
                          })}
                </Text>
            )}
        </Group>
    );
};
