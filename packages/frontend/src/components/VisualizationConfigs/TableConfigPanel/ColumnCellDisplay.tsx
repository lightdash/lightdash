import {
    friendlyName,
    getItemId,
    isFilterableItem,
    isNumericItem,
    type FilterableItem,
} from '@lightdash/common';
import { ActionIcon, Group, Stack, Text, Tooltip } from '@mantine-8/core';
import { IconEye, IconEyeOff, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { isTableVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

export const ColumnCellDisplay: FC = () => {
    const { itemsMap, resultsData, visualizationConfig, colorPalette } =
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
                <Group gap="two">
                    <Config.Heading>Bars in cells</Config.Heading>
                    <Tooltip
                        label="Display numeric values as bars in cells"
                        withinPortal
                        position="right"
                        variant="xs"
                    >
                        <MantineIcon icon={IconInfoCircle} color="ldGray.6" />
                    </Tooltip>
                </Group>
                <Stack gap="xs">
                    {numericFields.map((field) => {
                        const fieldId = getItemId(field);
                        const isBarChart =
                            chartConfig.columnProperties[fieldId]
                                ?.displayStyle === 'bar';
                        const barColor =
                            chartConfig.columnProperties[fieldId]?.color ||
                            colorPalette[0];

                        return (
                            <Group
                                key={fieldId}
                                gap="xs"
                                justify="space-between"
                            >
                                <Group gap="xs">
                                    <ColorSelector
                                        color={barColor}
                                        swatches={colorPalette}
                                        onColorChange={(color) => {
                                            chartConfig.updateColumnProperty(
                                                fieldId,
                                                {
                                                    color,
                                                },
                                            );
                                        }}
                                    />
                                    <Text size="sm">
                                        {'label' in field
                                            ? field.label
                                            : friendlyName(field.name)}
                                    </Text>
                                </Group>
                                <ActionIcon
                                    onClick={() => {
                                        chartConfig.updateColumnProperty(
                                            fieldId,
                                            {
                                                displayStyle: isBarChart
                                                    ? 'text'
                                                    : 'bar',
                                            },
                                        );
                                    }}
                                    color="ldGray.6"
                                    variant="light"
                                >
                                    <MantineIcon
                                        icon={isBarChart ? IconEye : IconEyeOff}
                                    />
                                </ActionIcon>
                            </Group>
                        );
                    })}
                </Stack>
            </Config.Section>
        </Config>
    );
};
