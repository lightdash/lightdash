import {
    getItemId,
    isFilterableItem,
    isNumericItem,
    type FilterableItem,
} from '@lightdash/common';
import { Checkbox, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import { Config } from '../common/Config';

export const BarChartDisplay: FC = () => {
    const { itemsMap, resultsData, visualizationConfig } =
        useVisualizationContext();

    const chartConfig = useMemo(() => {
        if (!isTableVisualizationConfig(visualizationConfig)) return undefined;
        return visualizationConfig.chartConfig;
    }, [visualizationConfig]);

    const activeFields = useMemo(() => {
        if (!resultsData?.metricQuery) return new Set<string>();
        return new Set([
            ...resultsData.metricQuery.dimensions,
            ...resultsData.metricQuery.metrics,
            ...resultsData.metricQuery.tableCalculations.map((tc) => tc.name),
        ]);
    }, [resultsData]);

    const numericFields = useMemo<FilterableItem[]>(() => {
        if (!itemsMap) return [];
        return Object.values(itemsMap)
            .filter((field) => activeFields.has(getItemId(field)))
            .filter(
                (field) => isNumericItem(field) && isFilterableItem(field),
            ) as FilterableItem[];
    }, [itemsMap, activeFields]);

    if (!chartConfig) {
        return null;
    }

    if (numericFields.length === 0) {
        return (
            <Text c="dimmed" size="sm">
                No numeric columns available for bar chart display
            </Text>
        );
    }

    return (
        <Config>
            <Config.Section>
                <Config.Heading>Bar chart columns</Config.Heading>
                <Stack spacing="md">
                    <Text size="sm" c="dimmed">
                        Display numeric values as bar charts
                    </Text>

                    {numericFields.map((field) => {
                        const fieldId = getItemId(field);
                        const isBarChart =
                            chartConfig.columnProperties[fieldId]
                                ?.displayStyle === 'bar';

                        return (
                            <Checkbox
                                key={fieldId}
                                label={field.name}
                                checked={isBarChart}
                                onChange={(e) => {
                                    chartConfig.updateColumnProperty(fieldId, {
                                        displayStyle: e.currentTarget.checked
                                            ? 'bar'
                                            : 'text',
                                    });
                                }}
                            />
                        );
                    })}
                </Stack>
            </Config.Section>
        </Config>
    );
};
