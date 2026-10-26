import {
    ECHARTS_DEFAULT_COLORS,
    getItemId,
    isNumericItem,
    MapChartType,
    MapHexbinAggregation,
    MapHexbinSizingMode,
    MapHexbinValueBasis,
    MapTileBackground,
} from '@lightdash/common';
import {
    Collapse,
    Group,
    RangeSlider,
    ScrollArea,
    Select,
    SegmentedControl,
    Slider,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import { memo, useState, type ComponentProps, type FC } from 'react';
import { shallowEqual } from 'react-redux';
import {
    selectMapAvailableFields,
    selectMapCategoricalColorDefaults,
    selectMapCategoricalValues,
    selectMapEditor,
    useVisualizationSelector,
    type VisualizationStoreState,
} from '../../../features/visualization/store';
import {
    DEFAULT_MAP_COLORS,
    useMapEditorActions,
} from '../../../hooks/useMapChartConfig';
import FieldSelect from '../../common/FieldSelect';
import {
    useVisualizationInputs,
    useVisualizationInputSelector,
} from '../../LightdashVisualization/useVisualizationContext';
import {
    DEFAULT_FIXED_RESOLUTION,
    HEXBIN_SIZE_PRESETS,
} from '../../SimpleMap/hexbin/zoomToResolution';
import ColorSelector from '../ColorSelector';
import { Config } from '../common/Config';
import { GradientStopsEditor } from '../common/GradientStopsEditor';

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
                Cell scale: {HEXBIN_SIZE_PRESETS[draftIdx]?.label}
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

// Fields this panel shows; pans and layout edits do not re-render it
const pickDisplayFields = (state: VisualizationStoreState) => {
    const editor = selectMapEditor(state);
    return {
        locationType: editor.locationType,
        valueFieldId: editor.valueFieldId,
        sizeFieldId: editor.sizeFieldId,
        colorRange: editor.colorRange,
        colorOverrides: editor.colorOverrides,
        noDataColor: editor.noDataColor,
        backgroundColor: editor.backgroundColor,
        dataLayerOpacity: editor.dataLayerOpacity,
        hexbinConfig: editor.hexbinConfig,
        heatmapConfig: editor.heatmapConfig,
        minBubbleSize: editor.minBubbleSize,
        maxBubbleSize: editor.maxBubbleSize,
        saveMapExtent: editor.saveMapExtent,
        showLegend: editor.showLegend,
        tileBackground: editor.tileBackground,
        darkModeTileBackground: editor.darkModeTileBackground,
    };
};

type DebouncedColorSelectorProps = Omit<
    ComponentProps<typeof ColorSelector>,
    'onColorChange'
> & { onColorChange: (color: string) => void };

// Keeps a draft while picking; the store gets the colour debounced
const DebouncedColorSelector: FC<DebouncedColorSelectorProps> = ({
    color,
    onColorChange,
    ...rest
}) => {
    const [draft, setDraft] = useState<string>();
    const commit = useDebouncedCallback((value: string) => {
        onColorChange(value);
        setDraft(undefined);
    }, { delay: 300, flushOnUnmount: true });
    return (
        <ColorSelector
            {...rest}
            color={draft ?? color}
            onColorChange={(value) => {
                setDraft(value);
                commit(value);
            }}
        />
    );
};

const tileBackgroundOptions = [
    { value: MapTileBackground.NONE, label: 'None' },
    { value: MapTileBackground.OPENSTREETMAP, label: 'OpenStreetMap' },
    { value: MapTileBackground.LIGHT, label: 'Light' },
    { value: MapTileBackground.DARK, label: 'Dark' },
    { value: MapTileBackground.VOYAGER, label: 'Voyager (clean)' },
    { value: MapTileBackground.SATELLITE, label: 'Satellite' },
];

export const Display: FC = memo(() => {
    const { itemsMap, colorPalette } = useVisualizationInputs();
    const config = useVisualizationSelector(pickDisplayFields, shallowEqual);
    const availableFields = useVisualizationInputSelector(
        selectMapAvailableFields,
    );
    const { values: uniqueStringValues, remainingCount } =
        useVisualizationInputSelector(selectMapCategoricalValues);
    const colorDefaults = useVisualizationInputSelector(
        selectMapCategoricalColorDefaults,
    );
    const {
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
    } = useMapEditorActions();

    const [draftOpacity, setDraftOpacity] = useState<number>();
    const commitOpacity = useDebouncedCallback((value: number) => {
        setDataLayerOpacity(value);
        setDraftOpacity(undefined);
    }, { delay: 100, flushOnUnmount: true });

    const [draftStop, setDraftStop] = useState<{
        index: number;
        color: string;
    }>();
    const commitStop = useDebouncedCallback((index: number, color: string) => {
        updateColor(index, color);
        setDraftStop(undefined);
    }, { delay: 300, flushOnUnmount: true });

    const storedColors = config.colorRange ?? DEFAULT_MAP_COLORS;
    const colors = draftStop
        ? storedColors.map((c, i) =>
              i === draftStop.index ? draftStop.color : c,
          )
        : storedColors;
    const isScatterMap =
        !config.locationType || config.locationType === MapChartType.SCATTER;
    const isAreaMap = config.locationType === MapChartType.AREA;
    const isBackgroundNone = config.tileBackground === MapTileBackground.NONE;

    const sizeField = config.sizeFieldId
        ? itemsMap?.[config.sizeFieldId]
        : undefined;
    const valueField = config.valueFieldId
        ? itemsMap?.[config.valueFieldId]
        : undefined;
    const isValueFieldNumeric = isNumericItem(valueField);
    const isHeatmap = config.locationType === MapChartType.HEATMAP;
    const isHexbin = config.locationType === MapChartType.HEXBIN;
    // Show color range for numeric values OR density-based coloring (heatmap/hexbin)
    const showColorRange = isValueFieldNumeric || isHeatmap || isHexbin;
    const hasSizeField = !!config.sizeFieldId;
    const colorOverrides = config.colorOverrides ?? {};

    return (
        <Stack>
            <Config>
                <Config.Section>
                    <Config.Heading>Cells</Config.Heading>
                    {!isHeatmap && !isHexbin && (
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
                    {isHexbin &&
                        (() => {
                            const valueBasis =
                                config.hexbinConfig?.valueBasis ??
                                MapHexbinValueBasis.COUNT;
                            const isFieldBasis =
                                valueBasis === MapHexbinValueBasis.FIELD;
                            const aggregation =
                                config.hexbinConfig?.aggregation ??
                                MapHexbinAggregation.SUM;
                            return (
                                <Stack gap="xs">
                                    <Config.Group>
                                        <Config.Label>
                                            Value based on
                                        </Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={valueBasis}
                                            data={[
                                                {
                                                    value: MapHexbinValueBasis.COUNT,
                                                    label: 'Count',
                                                },
                                                {
                                                    value: MapHexbinValueBasis.FIELD,
                                                    label: 'Field values',
                                                },
                                            ]}
                                            onChange={(v) => {
                                                const next =
                                                    v as MapHexbinValueBasis;
                                                setHexbinConfig({
                                                    valueBasis: next,
                                                });
                                                // Clear the picked field when
                                                // switching back to count so a
                                                // stale field doesn't surface
                                                // in tooltips/legend.
                                                if (
                                                    next ===
                                                    MapHexbinValueBasis.COUNT
                                                ) {
                                                    setValueFieldId(undefined);
                                                }
                                            }}
                                        />
                                    </Config.Group>
                                    <Collapse expanded={isFieldBasis}>
                                        <Stack gap="xs">
                                            <Group gap="xs" wrap="nowrap">
                                                <Config.Label>
                                                    Field
                                                </Config.Label>
                                                <FieldSelect
                                                    placeholder="Select field"
                                                    item={valueField}
                                                    items={availableFields}
                                                    onChange={(newField) =>
                                                        setValueFieldId(
                                                            newField
                                                                ? getItemId(
                                                                      newField,
                                                                  )
                                                                : undefined,
                                                        )
                                                    }
                                                    size="xs"
                                                    hasGrouping
                                                    clearable
                                                    miw={0}
                                                    flex={1}
                                                />
                                            </Group>
                                            <Config.Group>
                                                <Config.Label>
                                                    Aggregation
                                                </Config.Label>
                                                <SegmentedControl
                                                    size="xs"
                                                    value={aggregation}
                                                    data={[
                                                        {
                                                            value: MapHexbinAggregation.SUM,
                                                            label: 'Sum',
                                                        },
                                                        {
                                                            value: MapHexbinAggregation.AVG,
                                                            label: 'Avg',
                                                        },
                                                        {
                                                            value: MapHexbinAggregation.MIN,
                                                            label: 'Min',
                                                        },
                                                        {
                                                            value: MapHexbinAggregation.MAX,
                                                            label: 'Max',
                                                        },
                                                    ]}
                                                    onChange={(v) =>
                                                        setHexbinConfig({
                                                            aggregation:
                                                                v as MapHexbinAggregation,
                                                        })
                                                    }
                                                />
                                            </Config.Group>
                                        </Stack>
                                    </Collapse>
                                </Stack>
                            );
                        })()}
                    {(isAreaMap || isScatterMap) && (
                        <Group my="xs">
                            <DebouncedColorSelector
                                color={config.noDataColor ?? '#f3f3f3'}
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
                                <GradientStopsEditor
                                    colors={colors}
                                    onAddColor={addColor}
                                    onRemoveColor={removeColor}
                                    onColorChange={(index, color) => {
                                        setDraftStop({ index, color });
                                        commitStop(index, color);
                                    }}
                                />
                                {isHexbin && (
                                    <>
                                        <Config.Label mt="xs">
                                            Opacity
                                        </Config.Label>
                                        <Slider
                                            min={0.1}
                                            max={1}
                                            step={0.1}
                                            value={
                                                config.hexbinConfig?.opacity ??
                                                0.7
                                            }
                                            onChange={(value) =>
                                                setHexbinConfig({
                                                    opacity: value,
                                                })
                                            }
                                            marks={[
                                                { value: 0.1, label: '0.1' },
                                                { value: 0.5, label: '0.5' },
                                                { value: 1, label: '1' },
                                            ]}
                                        />
                                    </>
                                )}
                            </Stack>
                        </Config.Group>
                    )}
                    {!showColorRange && uniqueStringValues.length > 0 && (
                        <Config.Group>
                            <Stack w="100%" gap="xs">
                                <Config.Label>Value colors</Config.Label>
                                <ScrollArea.Autosize mah={300}>
                                    <Stack gap="xs">
                                        {uniqueStringValues.map((val) => (
                                            <Group
                                                key={val}
                                                gap="xs"
                                                wrap="nowrap"
                                            >
                                                <DebouncedColorSelector
                                                    color={
                                                        colorOverrides[val] ??
                                                        colorDefaults[val]
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
                                <DebouncedColorSelector
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
                                value={
                                    draftOpacity ??
                                    config.dataLayerOpacity ??
                                    0.7
                                }
                                onChange={(value) => {
                                    setDraftOpacity(value);
                                    commitOpacity(value);
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
                            <DebouncedColorSelector
                                color={config.backgroundColor ?? '#f3f3f3'}
                                swatches={ECHARTS_DEFAULT_COLORS}
                                onColorChange={setBackgroundColor}
                            />
                        </Config.Group>
                    )}

                    {isHexbin &&
                        (() => {
                            const sizingMode =
                                config.hexbinConfig?.sizingMode ??
                                MapHexbinSizingMode.DYNAMIC;
                            const isFixed =
                                sizingMode === MapHexbinSizingMode.FIXED;
                            const showEmpty =
                                config.hexbinConfig?.showEmptyBins ?? false;
                            return (
                                <Stack gap="xs" mt="xs">
                                    <Config.Group>
                                        <Config.Label>
                                            Show empty cells
                                        </Config.Label>
                                        <Switch
                                            size="xs"
                                            checked={showEmpty}
                                            onChange={(e) =>
                                                setHexbinConfig({
                                                    showEmptyBins:
                                                        e.currentTarget.checked,
                                                })
                                            }
                                        />
                                    </Config.Group>
                                    <Collapse expanded={showEmpty}>
                                        <Config.Group my="xs">
                                            <Config.Label>
                                                Empty cell fill
                                            </Config.Label>
                                            <DebouncedColorSelector
                                                color={
                                                    config.hexbinConfig
                                                        ?.emptyBinColor ??
                                                    '#adb5bd00'
                                                }
                                                swatches={[
                                                    '#adb5bd00',
                                                    ...ECHARTS_DEFAULT_COLORS,
                                                ]}
                                                withAlpha
                                                onColorChange={(c) => {
                                                    const isTransparent =
                                                        c.length === 9 &&
                                                        c.endsWith('00');
                                                    setHexbinConfig({
                                                        emptyBinColor:
                                                            isTransparent
                                                                ? null
                                                                : c,
                                                    });
                                                }}
                                            />
                                        </Config.Group>
                                    </Collapse>

                                    <Config.Group>
                                        <Config.Label>Cell size</Config.Label>
                                        <SegmentedControl
                                            size="xs"
                                            value={sizingMode}
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
                                            onChange={(v) =>
                                                setHexbinConfig({
                                                    sizingMode:
                                                        v as MapHexbinSizingMode,
                                                })
                                            }
                                        />
                                    </Config.Group>
                                    <Collapse expanded={isFixed}>
                                        <HexbinSizeSlider
                                            // Remount on external resolution
                                            // change so local draft state
                                            // resets without a useEffect.
                                            key={
                                                config.hexbinConfig
                                                    ?.fixedResolution ??
                                                DEFAULT_FIXED_RESOLUTION
                                            }
                                            storedResolution={
                                                config.hexbinConfig
                                                    ?.fixedResolution ??
                                                DEFAULT_FIXED_RESOLUTION
                                            }
                                            onCommit={(resolution) =>
                                                setHexbinConfig({
                                                    fixedResolution: resolution,
                                                })
                                            }
                                        />
                                    </Collapse>
                                </Stack>
                            );
                        })()}
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
                                    config.minBubbleSize ?? 5,
                                    config.maxBubbleSize ?? 20,
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
                                value={config.minBubbleSize ?? 5}
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
                            value={config.heatmapConfig?.radius ?? 25}
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
                            value={config.heatmapConfig?.blur ?? 15}
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
                            value={config.heatmapConfig?.opacity ?? 0.6}
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

            <Config>
                <Config.Section>
                    <Config.Heading>Map extent</Config.Heading>
                    <Config.Group>
                        <Config.Label>Save current map extent</Config.Label>
                        <Switch
                            size="xs"
                            checked={config.saveMapExtent}
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
                            size="xs"
                            checked={config.showLegend ?? false}
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
                            size="xs"
                            data={tileBackgroundOptions}
                            value={
                                config.tileBackground ??
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
                            size="xs"
                            data={tileBackgroundOptions}
                            value={
                                config.darkModeTileBackground ??
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
