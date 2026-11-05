import {
    friendlyName,
    getItemId,
    isFilterableItem,
    isNumericItem,
    type FilterableItem,
} from '@lightdash/common';
import { ActionIcon, Box, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconEye, IconEyeOff, IconInfoCircle } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { selectTableColumnProperties } from '../../../features/visualization/store';
import { useTableEditorActions } from '../../../hooks/tableVisualization/useTableConfig';
import MantineIcon from '../../common/MantineIcon';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

export const ColumnCellDisplay: FC = () => {
    const { itemsMap, resultsData, colorPalette } = useVisualizationInputs();
    const columnProperties = useVisualizationInputSelector(
        selectTableColumnProperties,
    );
    const { updateColumnProperty } = useTableEditorActions();

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
                        position="right"
                    >
                        <MantineIcon icon={IconInfoCircle} color="dimmed" />
                    </Tooltip>
                </Group>
                <Stack gap="xs">
                    {numericFields.map((field) => {
                        const fieldId = getItemId(field);
                        const isBarChart =
                            columnProperties[fieldId]?.displayStyle === 'bar';
                        const barColor =
                            columnProperties[fieldId]?.color || colorPalette[0];
                        const negativeColor =
                            columnProperties[fieldId]?.negativeColor;
                        // Negative bars default to the positive color until set.
                        const negativeBarColor = negativeColor || barColor;

                        const positiveColorSelector = (
                            <ColorSelector
                                color={barColor}
                                swatches={colorPalette}
                                ariaLabel="Select positive bar color"
                                onColorChange={(color) => {
                                    updateColumnProperty(fieldId, {
                                        color,
                                    });
                                }}
                            />
                        );

                        return (
                            <Group
                                key={fieldId}
                                gap="xs"
                                justify="space-between"
                            >
                                <Group gap="xs">
                                    {isBarChart ? (
                                        <>
                                            <Tooltip
                                                label="Positive values"
                                                variant="xs"
                                                position="top"
                                            >
                                                <Box>
                                                    {positiveColorSelector}
                                                </Box>
                                            </Tooltip>
                                            <Tooltip
                                                label="Negative values"
                                                variant="xs"
                                                position="top"
                                            >
                                                <Box>
                                                    <ColorSelector
                                                        color={negativeBarColor}
                                                        swatches={colorPalette}
                                                        ariaLabel="Select negative bar color"
                                                        onColorChange={(
                                                            newColor,
                                                        ) => {
                                                            updateColumnProperty(
                                                                fieldId,
                                                                {
                                                                    negativeColor:
                                                                        newColor,
                                                                },
                                                            );
                                                        }}
                                                        onColorReset={
                                                            negativeColor
                                                                ? () => {
                                                                      updateColumnProperty(
                                                                          fieldId,
                                                                          {
                                                                              negativeColor:
                                                                                  undefined,
                                                                          },
                                                                      );
                                                                  }
                                                                : undefined
                                                        }
                                                        resetLabel="Match positive color"
                                                    />
                                                </Box>
                                            </Tooltip>
                                        </>
                                    ) : (
                                        positiveColorSelector
                                    )}
                                    <Text size="sm">
                                        {'label' in field
                                            ? field.label
                                            : friendlyName(field.name)}
                                    </Text>
                                </Group>
                                <ActionIcon
                                    onClick={() => {
                                        updateColumnProperty(fieldId, {
                                            displayStyle: isBarChart
                                                ? 'text'
                                                : 'bar',
                                        });
                                    }}
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
