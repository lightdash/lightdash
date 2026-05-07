import {
    ECHARTS_DEFAULT_COLORS,
    getItemId,
    isCustomDimension,
    isDimension,
    isMetric,
    isNumericItem,
    isTableCalculation,
    MapChartType,
    MapHexbinSizingMode,
    MapTileBackground,
} from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Group,
    RangeSlider,
    ScrollArea,
    Select,
    SegmentedControl,
    Slider,
    Stack,
    Switch,
    Text,
} from '@mantine-8/core';
import { useHover } from '@mantine-8/hooks';
import { IconPlus, IconX } from '@tabler/icons-react';
import debounce from 'lodash/debounce';
import { memo, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { DEFAULT_MAP_COLORS } from '../../../hooks/useMapChartConfig';
import FieldSelect from '../../common/FieldSelect';
import GradientBar from '../../common/GradientBar';
import { isMapVisualizationConfig } from '../../LightdashVisualization/types';
import { useVisualizationContext } from '../../LightdashVisualization/useVisualizationContext';
import {
    DEFAULT_FIXED_RESOLUTION,
    HEXBIN_SIZE_PRESETS,
} from '../../SimpleMap/hexbin/zoomToResolution';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';

const findPresetIdxByResolution = (resolution: number): number => {
    const idx = HEXBIN_SIZE_PRESETS.findIndex(
        (p) => p.resolution === resolution,
    );
    if (idx >= 0) return idx;
    const fallback = HEXBIN_SIZE_PRESETS.findIndex(
        (p) => p.resolution === DEFAULT_FIXED_RESOLUTION,
    );
    return fallback >= 0 ? fallback : 0;
};

type HexbinSizeSliderProps = {
    storedResolution: number;
    onCommit: (resolution: number) => void;
};

// Hex binning is expensive enough that updating on every drag tick feels
// laggy. We keep the slider's value in local state during drag (cheap, only
// re-renders the slider/label) and commit to the chart config on release via
// onChangeEnd, which kicks off the actual rebin + re-render.
//
// External changes to `storedResolution` (e.g. switching sizing mode, loading
// a saved chart) are picked up by the parent passing a fresh `key` based on
// the stored value, which remounts this component with the new initial state.
// That avoids the useEffect-syncs-state anti-pattern.
const HexbinSizeSlider: FC<HexbinSizeSliderProps> = ({
    storedResolution,
    onCommit,
}) => {
    const [draftIdx, setDraftIdx] = useState<number>(() =>
        findPresetIdxByResolution(storedResolution),
    );

    return (
        <>
            <Text size="xs" mt="sm">
                Bin scale: {HEXBIN_SIZE_PRESETS[draftIdx]?.label}
            </Text>
            <Slider
                min={0}
                max={HEXBIN_SIZE_PRESETS.length - 1}
                step={1}
                value={draftIdx}
                onChange={setDraftIdx}
                onChangeEnd={(idx) =>
                    onCommit(HEXBIN_SIZE_PRESETS[idx].resolution)
                }
                label={(idx) => HEXBIN_SIZE_PRESETS[idx]?.label}
                marks={HEXBIN_SIZE_PRESETS.map((_, i) => ({ value: i }))}
                mb="md"
            />
        </>
    );
};

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
        <Stack gap="xs" align="center">
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
    const { visualizationConfig, itemsMap, resultsData, colorPalette } =
        useVisualizationContext();

    // Ref to hold the current setDataLayerOpacity function
    const setDataLayerOpacityRef = useRef<
        ((opacity: number | undefined) => void) | null
    >(null);

    // Stable debounced function that calls the ref
    const debouncedSetDataLayerOpacity = useRef(
        debounce((value: number) => {
            setDataLayerOpacityRef.current?.(value);
        }, 100),
    ).current;

    // Local state for immediate slider feedback (initialized with default, synced via effect)
    const [localOpacity, setLocalOpacity] = useState(0.7);

    // Get the config opacity value (only available when it's a map config)
    const configOpacity = isMapVisualizationConfig(visualizationConfig)
        ? (visualizationConfig.chartConfig.validConfig.dataLayerOpacity ?? 0.7)
        : 0.7;

    // Sync local state when config changes externally
    useEffect(() => {
        setLocalOpacity(configOpacity);
    }, [configOpacity]);

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

    const mapChartConfig = isMapVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig
        : null;

    // Unique string values for categorical color picker (first 50)
    const MAX_COLOR_VALUES = 50;
    const { uniqueStringValues, remainingCount } = useMemo(() => {
        if (!mapChartConfig)
            return { uniqueStringValues: [], remainingCount: 0 };
        const { valueFieldId } = mapChartConfig.validConfig;
        const valueItem = valueFieldId ? itemsMap?.[valueFieldId] : undefined;
        const isNumeric = isNumericItem(valueItem);
        const isHeatmapType =
            mapChartConfig.validConfig.locationType === MapChartType.HEATMAP;
        if (isNumeric || isHeatmapType || !valueFieldId || !resultsData?.rows)
            return { uniqueStringValues: [], remainingCount: 0 };
        const seen = new Set<string>();
        for (const row of resultsData.rows) {
            const cell = row[valueFieldId];
            if (cell?.value?.raw != null && cell.value.raw !== '') {
                seen.add(String(cell.value.raw));
            }
        }
        const sorted = Array.from(seen).sort();
        return {
            uniqueStringValues: sorted.slice(0, MAX_COLOR_VALUES),
            remainingCount: Math.max(0, sorted.length - MAX_COLOR_VALUES),
        };
    }, [mapChartConfig, itemsMap, resultsData?.rows]);

    const tileBackgroundOptions = useMemo(
        () => [
            { value: MapTileBackground.NONE, label: 'None' },
            { value: MapTileBackground.OPENSTREETMAP, label: 'OpenStreetMap' },
            { value: MapTileBackground.LIGHT, label: 'Light' },
            { value: MapTileBackground.DARK, label: 'Dark' },
            { value: MapTileBackground.VOYAGER, label: 'Voyager (clean)' },
            { value: MapTileBackground.SATELLITE, label: 'Satellite' },
        ],
        [],
    );

    if (!mapChartConfig) {
        return null;
    }

    const {
        validConfig,
        addColor,
        removeColor,
        updateColor,
        setShowLegend,
        setSaveMapExtent,
        setMinBubbleSize,
        setMaxBubbleSize,
        setSizeFieldId,
        setValueFieldId,
        setHeatmapConfig,
        setHexbinConfig,
        setTileBackground,
        setDarkModeTileBackground,
        setBackgroundColor,
        setNoDataColor,
        setDataLayerOpacity,
        setColorOverride,
    } = mapChartConfig;

    const colors = validConfig.colorRange ?? DEFAULT_MAP_COLORS;
    const canAddColor = colors.length < 5;
    const isScatterMap =
        !validConfig.locationType ||
        validConfig.locationType === MapChartType.SCATTER;
    const isAreaMap = validConfig.locationType === MapChartType.AREA;
    const isBackgroundNone =
        validConfig.tileBackground === MapTileBackground.NONE;

    // Get selected size field object
    const sizeField = itemsMap
        ? validConfig.sizeFieldId
            ? itemsMap[validConfig.sizeFieldId]
            : undefined
        : undefined;

    // Get selected value field object and check if it's numeric
    const valueField = itemsMap
        ? validConfig.valueFieldId
            ? itemsMap[validConfig.valueFieldId]
            : undefined
        : undefined;
    const isValueFieldNumeric = isNumericItem(valueField);
    const isHeatmap = validConfig.locationType === MapChartType.HEATMAP;
    const isHexbin = validConfig.locationType === MapChartType.HEXBIN;
    // Show color range for numeric values OR density-based coloring (heatmap/hexbin)
    const showColorRange = isValueFieldNumeric || isHeatmap || isHexbin;
    const hasSizeField = !!validConfig.sizeFieldId;
    const colorOverrides = validConfig.colorOverrides ?? {};

    // Update the ref with the current function
    setDataLayerOpacityRef.current = setDataLayerOpacity;

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Colors</Config.Heading>
                    {!isHeatmap && (
                        <Config.Group>
                            <FieldSelect
                                label="Color based on"
                                placeholder="Select field (optional)"
                                item={valueField}
                                items={availableFields}
                                onChange={(newField) =>
                                    setValueFieldId(
                                        newField
                                            ? getItemId(newField)
                                            : undefined,
                                    )
                                }
                                hasGrouping
                                clearable
                            />
                        </Config.Group>
                    )}
                    {(isAreaMap || isScatterMap) && (
                        <Group my="xs">
                            <ColorSelector
                                color={validConfig.noDataColor ?? '#f3f3f3'}
                                swatches={ECHARTS_DEFAULT_COLORS}
                                onColorChange={setNoDataColor}
                            />
                            <Config.Label>No data color</Config.Label>
                        </Group>
                    )}
                    {showColorRange && (
                        <Config.Group mb="xs">
                            <Stack w="100%" gap="xs">
                                <Config.Label>Color range</Config.Label>
                                <Group gap="xs" align="flex-start">
                                    {colors.map((color, index) => {
                                        const isFirst = index === 0;
                                        const isLast =
                                            index === colors.length - 1;
                                        const label = isFirst
                                            ? 'Low'
                                            : isLast
                                              ? 'High'
                                              : '';
                                        // Can only remove middle colors (not first or last)
                                        const canRemove =
                                            !isFirst &&
                                            !isLast &&
                                            colors.length > 2;

                                        return (
                                            <ColorItem
                                                key={index}
                                                color={color}
                                                label={label}
                                                canRemove={canRemove}
                                                onColorChange={(newColor) =>
                                                    updateColor(index, newColor)
                                                }
                                                onRemove={() =>
                                                    removeColor(index)
                                                }
                                            />
                                        );
                                    })}
                                    {canAddColor && (
                                        <Stack gap={4} align="center">
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
                                <GradientBar colors={colors} />
                            </Stack>
                        </Config.Group>
                    )}
                    {!showColorRange && uniqueStringValues.length > 0 && (
                        <Config.Group>
                            <Stack w="100%" gap="xs">
                                <Config.Label>Value colors</Config.Label>
                                <ScrollArea.Autosize mah={300}>
                                    <Stack gap="xs">
                                        {uniqueStringValues.map((val, idx) => (
                                            <Group
                                                key={val}
                                                gap="xs"
                                                wrap="nowrap"
                                            >
                                                <ColorSelector
                                                    color={
                                                        colorOverrides[val] ??
                                                        colorPalette[
                                                            idx %
                                                                colorPalette.length
                                                        ]
                                                    }
                                                    swatches={colorPalette}
                                                    onColorChange={(c) =>
                                                        setColorOverride(val, c)
                                                    }
                                                />
                                                <Text fz="xs" truncate>
                                                    {val}
                                                </Text>
                                            </Group>
                                        ))}
                                        {remainingCount > 0 && (
                                            <Text
                                                fz="xs"
                                                c="dimmed"
                                                fs="italic"
                                            >
                                                {remainingCount} more colored
                                                automatically
                                            </Text>
                                        )}
                                    </Stack>
                                </ScrollArea.Autosize>
                            </Stack>
                        </Config.Group>
                    )}
                    {!showColorRange &&
                        uniqueStringValues.length === 0 &&
                        !isAreaMap && (
                            <Config.Group>
                                <Config.Label>Color</Config.Label>
                                <ColorSelector
                                    color={
                                        colors[Math.floor(colors.length / 2)]
                                    }
                                    swatches={ECHARTS_DEFAULT_COLORS}
                                    onColorChange={(newColor) => {
                                        // Set a single color in the middle of the range
                                        updateColor(
                                            Math.floor(colors.length / 2),
                                            newColor,
                                        );
                                    }}
                                />
                            </Config.Group>
                        )}
                    {(isScatterMap || isAreaMap) && (
                        <>
                            <Config.Label mt="xs">
                                Data layer opacity
                            </Config.Label>
                            <Slider
                                min={0.1}
                                max={1}
                                step={0.1}
                                value={localOpacity}
                                onChange={(value) => {
                                    setLocalOpacity(value);
                                    debouncedSetDataLayerOpacity(value);
                                }}
                                marks={[
                                    { value: 0.1, label: '0.1' },
                                    { value: 0.5, label: '0.5' },
                                    { value: 1, label: '1' },
                                ]}
                                mb="md"
                            />
                        </>
                    )}

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
                            {hasSizeField ? 'Size range' : 'Size'}
                        </Text>
                        {hasSizeField ? (
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
                        ) : (
                            <Slider
                                min={0}
                                max={100}
                                step={1}
                                value={validConfig.minBubbleSize ?? 5}
                                onChange={(value) => {
                                    setMinBubbleSize(value);
                                    setMaxBubbleSize(value);
                                }}
                                marks={[
                                    { value: 0, label: '0' },
                                    { value: 50, label: '50' },
                                    { value: 100, label: '100' },
                                ]}
                                mb="md"
                            />
                        )}
                    </Config.Section>
                </Config>
            )}

            {isHeatmap && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Heatmap</Config.Heading>
                        <Text size="xs" mt="sm">
                            Radius
                        </Text>
                        <Slider
                            min={1}
                            max={50}
                            step={1}
                            value={validConfig.heatmapConfig?.radius ?? 25}
                            onChange={(value) =>
                                setHeatmapConfig({ radius: value })
                            }
                            marks={[
                                { value: 1, label: '1' },
                                { value: 25, label: '25' },
                                { value: 50, label: '50' },
                            ]}
                            mb="md"
                        />
                        <Text size="xs" mt="sm">
                            Blur
                        </Text>
                        <Slider
                            min={0}
                            max={30}
                            step={1}
                            value={validConfig.heatmapConfig?.blur ?? 15}
                            onChange={(value) =>
                                setHeatmapConfig({ blur: value })
                            }
                            marks={[
                                { value: 0, label: '0' },
                                { value: 15, label: '15' },
                                { value: 30, label: '30' },
                            ]}
                            mb="md"
                        />
                        <Text size="xs" mt="sm">
                            Opacity
                        </Text>
                        <Slider
                            min={0.1}
                            max={1}
                            step={0.1}
                            value={validConfig.heatmapConfig?.opacity ?? 0.6}
                            onChange={(value) =>
                                setHeatmapConfig({ opacity: value })
                            }
                            marks={[
                                { value: 0.1, label: '0.1' },
                                { value: 0.5, label: '0.5' },
                                { value: 1, label: '1' },
                            ]}
                            mb="md"
                        />
                    </Config.Section>
                </Config>
            )}

            {isHexbin && (
                <Config>
                    <Config.Section>
                        <Config.Heading>Hexbin</Config.Heading>
                        <Text size="xs" mt="sm">
                            Bin size
                        </Text>
                        <SegmentedControl
                            data={[
                                {
                                    value: MapHexbinSizingMode.FIXED,
                                    label: 'Fixed',
                                },
                                {
                                    value: MapHexbinSizingMode.DYNAMIC,
                                    label: 'Dynamic',
                                },
                            ]}
                            value={
                                validConfig.hexbinConfig?.sizingMode ??
                                MapHexbinSizingMode.DYNAMIC
                            }
                            onChange={(value) =>
                                setHexbinConfig({
                                    sizingMode: value as MapHexbinSizingMode,
                                })
                            }
                            fullWidth
                            mb="xs"
                        />
                        {(validConfig.hexbinConfig?.sizingMode ??
                            MapHexbinSizingMode.DYNAMIC) ===
                            MapHexbinSizingMode.FIXED && (
                            <HexbinSizeSlider
                                // Remount when the stored resolution changes
                                // outside of a drag — e.g. switching sizing
                                // mode or loading a saved chart — so the
                                // slider's local draft state resets without
                                // needing a useEffect-syncs-state pattern.
                                key={
                                    validConfig.hexbinConfig?.fixedResolution ??
                                    DEFAULT_FIXED_RESOLUTION
                                }
                                storedResolution={
                                    validConfig.hexbinConfig?.fixedResolution ??
                                    DEFAULT_FIXED_RESOLUTION
                                }
                                onCommit={(resolution) =>
                                    setHexbinConfig({
                                        fixedResolution: resolution,
                                    })
                                }
                            />
                        )}
                        <Text size="xs" mt="sm">
                            Opacity
                        </Text>
                        <Slider
                            min={0.1}
                            max={1}
                            step={0.1}
                            value={validConfig.hexbinConfig?.opacity ?? 0.7}
                            onChange={(value) =>
                                setHexbinConfig({ opacity: value })
                            }
                            marks={[
                                { value: 0.1, label: '0.1' },
                                { value: 0.5, label: '0.5' },
                                { value: 1, label: '1' },
                            ]}
                            mb="md"
                        />
                        <Text size="xs" c="dimmed" mt="xs">
                            Bins are computed from up to 50,000 points;
                            additional points are ignored.
                        </Text>
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
                    <Config.Group>
                        <Config.Label>Light mode</Config.Label>
                        <Select
                            data={tileBackgroundOptions}
                            value={
                                validConfig.tileBackground ??
                                MapTileBackground.OPENSTREETMAP
                            }
                            onChange={(value) =>
                                setTileBackground(
                                    (value as MapTileBackground) || undefined,
                                )
                            }
                        />
                    </Config.Group>
                    <Config.Group>
                        <Config.Label>Dark mode</Config.Label>
                        <Select
                            data={tileBackgroundOptions}
                            value={
                                validConfig.darkModeTileBackground ??
                                MapTileBackground.DARK
                            }
                            onChange={(value) =>
                                setDarkModeTileBackground(
                                    (value as MapTileBackground) || undefined,
                                )
                            }
                        />
                    </Config.Group>
                </Config.Section>
            </Config>
        </Stack>
    );
});
