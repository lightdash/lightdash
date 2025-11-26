import { ECHARTS_DEFAULT_COLORS, MapChartType } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    NumberInput,
    RangeSlider,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { IconCamera, IconPlus, IconX } from '@tabler/icons-react';
import { memo, useCallback, type FC } from 'react';
import { DEFAULT_MAP_COLORS } from '../../../hooks/useMapChartConfig';
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
    const { visualizationConfig, chartRef } = useVisualizationContext();

    const handleCaptureCurrentView = useCallback(() => {
        if (!chartRef.current) return;
        const instance = chartRef.current.getEchartsInstance();
        if (!instance) return;

        const option = instance.getOption() as Record<string, unknown>;

        // Try to get geo settings first (for scatter maps)
        const geoArray = option.geo as
            | Array<{
                  zoom?: number;
                  center?: [number, number];
              }>
            | undefined;
        const geo = geoArray?.[0];
        if (geo) {
            const zoom = geo.zoom ?? 1;
            const center = geo.center ?? [0, 0];

            if (isMapVisualizationConfig(visualizationConfig)) {
                const {
                    setDefaultZoom,
                    setDefaultCenterLat,
                    setDefaultCenterLon,
                } = visualizationConfig.chartConfig;
                setDefaultZoom(zoom);
                setDefaultCenterLat(center[1]);
                setDefaultCenterLon(center[0]);
            }
            return;
        }

        // Try series settings (for choropleth maps)
        const seriesArray = option.series as
            | Array<{
                  type?: string;
                  zoom?: number;
                  center?: [number, number];
              }>
            | undefined;
        const series = seriesArray?.[0];
        if (series && series.type === 'map') {
            const zoom = series.zoom ?? 1;
            const center = series.center ?? [0, 0];

            if (isMapVisualizationConfig(visualizationConfig)) {
                const {
                    setDefaultZoom,
                    setDefaultCenterLat,
                    setDefaultCenterLon,
                } = visualizationConfig.chartConfig;
                setDefaultZoom(zoom);
                setDefaultCenterLat(center[1]);
                setDefaultCenterLon(center[0]);
            }
        }
    }, [chartRef, visualizationConfig]);

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
            setDefaultZoom,
            setDefaultCenterLat,
            setDefaultCenterLon,
            setMinBubbleSize,
            setMaxBubbleSize,
        },
    } = visualizationConfig;

    const colors = validConfig.colorRange ?? DEFAULT_MAP_COLORS;
    const canAddColor = colors.length < 5;
    const isScatterMap =
        !validConfig.locationType ||
        validConfig.locationType === MapChartType.SCATTER;

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
                    <Config.Group>
                        <Config.Label>Legend</Config.Label>
                        <Switch
                            checked={validConfig.showLegend ?? false}
                            onChange={(e) =>
                                setShowLegend(e.currentTarget.checked)
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>

            {isScatterMap && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Bubble size</Config.Heading>
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
                    <Config.Heading>Default view</Config.Heading>
                    <Group spacing="md" grow>
                        <NumberInput
                            label="Zoom"
                            value={validConfig.defaultZoom ?? ''}
                            onChange={(value) =>
                                setDefaultZoom(
                                    value === '' ? undefined : Number(value),
                                )
                            }
                            min={1}
                            max={10}
                            step={0.1}
                            precision={2}
                        />
                        <NumberInput
                            label="Latitude"
                            value={validConfig.defaultCenterLat ?? ''}
                            onChange={(value) =>
                                setDefaultCenterLat(
                                    value === '' ? undefined : Number(value),
                                )
                            }
                            precision={2}
                        />
                        <NumberInput
                            label="Longitude"
                            value={validConfig.defaultCenterLon ?? ''}
                            onChange={(value) =>
                                setDefaultCenterLon(
                                    value === '' ? undefined : Number(value),
                                )
                            }
                            precision={2}
                        />
                    </Group>
                    <Button
                        variant="light"
                        leftIcon={<IconCamera size={16} />}
                        mt="sm"
                        fullWidth
                        onClick={handleCaptureCurrentView}
                    >
                        Capture current view
                    </Button>
                </Config.Section>
            </Config>
        </Stack>
    );
});
