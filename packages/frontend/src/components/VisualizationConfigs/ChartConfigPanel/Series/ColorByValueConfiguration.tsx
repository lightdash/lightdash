import {
    formatItemValue,
    type CartesianChartLayout,
    type Series,
} from '@lightdash/common';
import { Box, Group, Text } from '@mantine/core';
import { type FC } from 'react';
import type useCartesianChartConfig from '../../../../hooks/cartesianChartConfig/useCartesianChartConfig';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';

type ColorByValueConfigurationProps = {
    layout?: CartesianChartLayout;
    series: Series;
} & Pick<ReturnType<typeof useCartesianChartConfig>, 'updateSingleSeries'>;

/**
 * Renders a list of dimension values with color swatches, allowing users
 * to customize the color for each bar when "color by value" is enabled.
 * Similar in appearance to the grouped series panel (Low/Medium/High style).
 */
const ColorByValueConfiguration: FC<ColorByValueConfigurationProps> = ({
    layout,
    series,
    updateSingleSeries,
}) => {
    const { resultsData, colorPalette, itemsMap } = useVisualizationContext();

    // Determine the dimension field ID (xField in normal, yField[0] when flipped)
    const dimensionFieldId = layout?.flipAxes
        ? layout?.yField?.[0]
        : layout?.xField;

    if (!dimensionFieldId || !resultsData?.rows || !itemsMap) {
        return null;
    }

    const dimensionItem = itemsMap[dimensionFieldId];

    // Extract unique formatted dimension values in row order
    const seenValues = new Set<string>();
    const uniqueDimensionValues: string[] = [];
    for (const row of resultsData.rows) {
        const rawValue = row[dimensionFieldId]?.value;
        const formatted = dimensionItem
            ? formatItemValue(dimensionItem, rawValue, true)
            : String(rawValue ?? '');
        if (!seenValues.has(formatted)) {
            seenValues.add(formatted);
            uniqueDimensionValues.push(formatted);
        }
    }

    if (uniqueDimensionValues.length === 0) {
        return null;
    }

    return (
        <Box
            bg="ldGray.1"
            p="xxs"
            py="xs"
            sx={(theme) => ({ borderRadius: theme.radius.sm })}
        >
            {uniqueDimensionValues.map((dimValue, i) => {
                const currentColor =
                    series.colorByValueColors?.[dimValue] ??
                    colorPalette[i % colorPalette.length];

                return (
                    <Group key={dimValue} spacing="xs" px="xs" py={4} noWrap>
                        <ColorSelector
                            color={currentColor}
                            swatches={colorPalette}
                            withAlpha
                            onColorChange={(color) => {
                                updateSingleSeries({
                                    ...series,
                                    colorByValueColors: {
                                        ...series.colorByValueColors,
                                        [dimValue]: color,
                                    },
                                });
                            }}
                        />
                        <Text size="xs" truncate>
                            {dimValue}
                        </Text>
                    </Group>
                );
            })}
        </Box>
    );
};

export default ColorByValueConfiguration;
