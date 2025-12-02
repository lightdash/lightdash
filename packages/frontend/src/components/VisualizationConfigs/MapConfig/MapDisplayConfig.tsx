import {
    ECHARTS_DEFAULT_COLORS,
    getItemId,
    isCustomDimension,
    isDimension,
    isMetric,
    isTableCalculation,
    MapChartType,
    MapTileBackground,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    RangeSlider,
    Select,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconPlus, IconX } from '@tabler/icons-react';
import { memo, useMemo, type FC } from 'react';
import { DEFAULT_MAP_COLORS } from '../../../hooks/useMapChartConfig';
import FieldSelect from '../../common/FieldSelect';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

type ColorItemProps = {
    color: string;
    label: string;
    canRemove: boolean;
    onColorChange: (color: string) => void;
    onRemove: () => void;
};

const ColorItem: FC<ColorItemProps> = ({
    color,
    label,
    canRemove,
    onColorChange,
    onRemove,
}) => {
    const { hovered, ref } = useHover();

    return (
        <Stack spacing={4} align="center">
            <Text size="xs" fw={500} h={16}>
                {label || '\u00A0'}
            </Text>
            <Box ref={ref} pos="relative">
                <ColorSelector
                    color={color}
                    swatches={ECHARTS_DEFAULT_COLORS}
                    onColorChange={onColorChange}
                />
                {canRemove && hovered && (
                    <ActionIcon
                        size={14}
                        variant="filled"
                        color="gray"
                        radius="xl"
                        pos="absolute"
                        top={-4}
                        right={-4}
                        onClick={onRemove}
                        style={{ zIndex: 10 }}
                    >
                        <IconX size={8} />
                    </ActionIcon>
                )}
            </Box>
        </Stack>
    );
};

export const Display: FC = memo(() => {
    const { visualizationConfig, itemsMap } = useVisualizationContext();

    // Get all available fields for selection (dimensions, metrics, and table calculations)
    const availableFields = useMemo(() => {
        if (!itemsMap) return [];

        return Object.values(itemsMap).filter(
            (item) =>
                isDimension(item) ||
                isCustomDimension(item) ||
                isMetric(item) ||
                isTableCalculation(item),
        );
    }, [itemsMap]);

    if (!isMapVisualizationConfig(visualizationConfig)) {
        return null;
    }

    const {
        chartConfig: {
            validConfig,
            addColor,
            removeColor,
            updateColor,
            setShowLegend,
            setSaveMapExtent,
            setMinBubbleSize,
            setMaxBubbleSize,
            setSizeFieldId,
            setTileBackground,
            setBackgroundColor,
        },
    } = visualizationConfig;

    const colors = validConfig.colorRange ?? DEFAULT_MAP_COLORS;
    const canAddColor = colors.length < 5;
    const isScatterMap =
        !validConfig.locationType ||
        validConfig.locationType === MapChartType.SCATTER;
    const isBackgroundNone =
        validConfig.tileBackground === MapTileBackground.NONE;

    // Get selected size field object
    const sizeField = itemsMap
        ? validConfig.sizeFieldId
            ? itemsMap[validConfig.sizeFieldId]
            : undefined
        : undefined;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Color range</Config.Heading>
                    <Group spacing="xs" align="flex-start">
                        {colors.map((color, index) => {
                            const isFirst = index === 0;
                            const isLast = index === colors.length - 1;
                            const label = isFirst
                                ? 'Low'
                                : isLast
                                ? 'High'
                                : '';
                            // Can only remove middle colors (not first or last)
                            const canRemove =
                                !isFirst && !isLast && colors.length > 2;

                            return (
                                <ColorItem
                                    key={index}
                                    color={color}
                                    label={label}
                                    canRemove={canRemove}
                                    onColorChange={(newColor) =>
                                        updateColor(index, newColor)
                                    }
                                    onRemove={() => removeColor(index)}
                                />
                            );
                        })}
                        {canAddColor && (
                            <Stack spacing={4} align="center">
                                <Text size="xs" fw={500} h={16}>
                                    {'\u00A0'}
                                </Text>
                                <ActionIcon
                                    size="sm"
                                    variant="light"
                                    onClick={addColor}
                                >
                                    <IconPlus size={14} />
                                </ActionIcon>
                            </Stack>
                        )}
                    </Group>
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>Legend</Config.Heading>
                    <Config.Group>
                        <Config.Label>Show legend</Config.Label>
                        <Switch
                            checked={validConfig.showLegend ?? false}
                            onChange={(e) =>
                                setShowLegend(e.currentTarget.checked)
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>

            <Config>
                <Config.Section>
                    <Config.Heading>Background map</Config.Heading>
                    <Select
                        data={[
                            { value: MapTileBackground.NONE, label: 'None' },

                            { value: MapTileBackground.LIGHT, label: 'Light' },
                            {
                                value: MapTileBackground.OPENSTREETMAP,
                                label: 'OpenStreetMap',
                            },
                            { value: MapTileBackground.DARK, label: 'Dark' },
                            {
                                value: MapTileBackground.SATELLITE,
                                label: 'Satellite',
                            },
                        ]}
                        value={
                            validConfig.tileBackground ??
                            MapTileBackground.LIGHT
                        }
                        onChange={(value) =>
                            setTileBackground(
                                (value as MapTileBackground) || undefined,
                            )
                        }
                    />
                    {isBackgroundNone && (
                        <Config.Group>
                            <Config.Label>Background color</Config.Label>
                            <ColorSelector
                                color={validConfig.backgroundColor ?? '#f3f3f3'}
                                swatches={ECHARTS_DEFAULT_COLORS}
                                onColorChange={setBackgroundColor}
                            />
                        </Config.Group>
                    )}
                </Config.Section>
            </Config>

            {isScatterMap && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Bubbles</Config.Heading>
                        <FieldSelect
                            label="Size based on"
                            placeholder="Select field (optional)"
                            item={sizeField}
                            items={availableFields}
                            onChange={(newField) =>
                                setSizeFieldId(
                                    newField ? getItemId(newField) : undefined,
                                )
                            }
                            hasGrouping
                            clearable
                        />
                        <Text size="xs" c="dimmed" mt="xs" mb="xs">
                            Size range
                        </Text>
                        <RangeSlider
                            min={0}
                            max={100}
                            step={1}
                            minRange={1}
                            value={[
                                validConfig.minBubbleSize ?? 5,
                                validConfig.maxBubbleSize ?? 20,
                            ]}
                            onChange={([min, max]) => {
                                setMinBubbleSize(min);
                                setMaxBubbleSize(max);
                            }}
                            marks={[
                                { value: 0, label: '0' },
                                { value: 50, label: '50' },
                                { value: 100, label: '100' },
                            ]}
                            mb="md"
                        />
                    </Config.Section>
                </Config>
            )}

            <Config>
                <Config.Section>
                    <Config.Heading>Map extent</Config.Heading>
                    <Config.Group>
                        <Config.Label>Save current map extent</Config.Label>
                        <Switch
                            checked={validConfig.saveMapExtent}
                            onChange={(e) =>
                                setSaveMapExtent(e.currentTarget.checked)
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>
        </Stack>
    );
});
