import {
    CartesianSeriesType,
    createConditionalFormattingConfigWithSingleColor,
    getItemId,
    getSeriesId,
    StackType,
    type CustomDimension,
    type Field,
    type Series as SeriesType,
    type TableCalculation,
} from '@lightdash/common';
import { Checkbox, Divider, Stack, Switch } from '@mantine/core';
import { Fragment, useCallback, useMemo, type FC } from 'react';
import {
    getSeriesGroupedByField,
    isPivotSeriesOrderDeterminedByQuery,
    moveSeriesGroup,
    type SeriesGroup,
} from '../../../../hooks/cartesianChartConfig/utils';
import { SortableItem, SortableList } from '../../../common/Sortable/Sortable';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import {
    useSeriesColor,
    useVisualizationConfig,
    useVisualizationInputs,
} from '../../../LightdashVisualization/useVisualizationContext';
import { ColorPaletteSection } from '../../common/ColorPaletteSection';
import { Config } from '../../common/Config';
import BasicSeriesConfiguration from './BasicSeriesConfiguration';
import { CustomColors } from './CustomColors';
import GroupedSeriesConfiguration from './GroupedSeriesConfiguration';
import { IncompletePeriodSection } from './IncompletePeriodSection';
import InvalidSeriesConfiguration from './InvalidSeriesConfiguration';
import { SeriesDrawOrderBar } from './SeriesDrawOrder';

type Props = {
    items: (Field | TableCalculation | CustomDimension)[];
};

export const Series: FC<Props> = ({ items }) => {
    // A wide panel: it shows nearly every series field, so it reads the aggregate
    const visualizationConfig = useVisualizationConfig();
    const getSeriesColor = useSeriesColor();
    const { pivotDimensions, resultsData, colorPalette } =
        useVisualizationInputs();

    const yField = isCartesianVisualizationConfig(visualizationConfig)
        ? visualizationConfig.chartConfig.dirtyLayout?.yField
        : undefined;

    const sortedByPivot = useMemo(
        () =>
            isPivotSeriesOrderDeterminedByQuery(
                pivotDimensions,
                yField,
                resultsData?.metricQuery?.sorts,
            ),
        [pivotDimensions, yField, resultsData?.metricQuery?.sorts],
    );

    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const chartConfig = useMemo(() => {
        if (!isCartesianChart) return;
        return visualizationConfig.chartConfig;
    }, [isCartesianChart, visualizationConfig]);

    const seriesGroupedByField = useMemo(() => {
        if (!isCartesianChart) return;

        const { dirtyEchartsConfig } = visualizationConfig.chartConfig;

        return getSeriesGroupedByField(dirtyEchartsConfig?.series ?? []);
    }, [isCartesianChart, visualizationConfig]);

    const applyGroupOrder = useCallback(
        (groups: SeriesGroup[]) => {
            if (!chartConfig) return;
            chartConfig.updateSeries(
                groups.reduce<SeriesType[]>(
                    (acc, seriesGroup) => [
                        ...acc,
                        ...seriesGroup.value.map((s) => ({
                            ...s,
                            color: getSeriesColor(s),
                        })),
                    ],
                    [],
                ),
            );
        },
        [chartConfig, getSeriesColor],
    );

    const groupIds = useMemo(
        () =>
            seriesGroupedByField?.map((group) => getSeriesId(group.value[0])) ??
            [],
        [seriesGroupedByField],
    );

    // Groups whose field is missing render without a drag handle
    const sortableGroupIds = useMemo(
        () =>
            groupIds.filter((_id, i) =>
                items.some(
                    (item) =>
                        getItemId(item) ===
                        seriesGroupedByField?.[i].value[0].encode.yRef.field,
                ),
            ),
        [groupIds, items, seriesGroupedByField],
    );

    const onReorder = useCallback(
        (from: number, to: number) => {
            if (!seriesGroupedByField) return;
            applyGroupOrder(
                moveSeriesGroup(
                    seriesGroupedByField,
                    groupIds.indexOf(sortableGroupIds[from]),
                    groupIds.indexOf(sortableGroupIds[to]),
                ),
            );
        },
        [seriesGroupedByField, applyGroupOrder, groupIds, sortableGroupIds],
    );

    const onReverseOrder = useCallback(() => {
        if (!seriesGroupedByField) return;
        applyGroupOrder([...seriesGroupedByField].reverse());
    }, [seriesGroupedByField, applyGroupOrder]);

    const onBringToFront = useCallback(
        (index: number) => {
            if (!seriesGroupedByField) return;
            applyGroupOrder(
                moveSeriesGroup(
                    seriesGroupedByField,
                    index,
                    seriesGroupedByField.length - 1,
                ),
            );
        },
        [seriesGroupedByField, applyGroupOrder],
    );

    if (!isCartesianChart) return null;

    const {
        dirtyEchartsConfig,
        dirtyLayout,
        dirtyChartType,
        updateSeries,
        getSingleSeries,
        updateSingleSeries,
        updateAllGroupedSeries,
        setColorByCategory,
        setCategoryColorOverride,
        setAllCategoryColorOverrides,
        conditionalFormattings,
        onSetConditionalFormattings,
    } = visualizationConfig.chartConfig;

    const allSeries = dirtyEchartsConfig?.series ?? [];

    const stackedBarSeries = allSeries.filter(
        (s) => s.stack && s.type === CartesianSeriesType.BAR,
    );
    const hasStackedBars = stackedBarSeries.length > 0;
    const showOverlappingLabelsEnabled =
        hasStackedBars &&
        stackedBarSeries.every((s) => s.label?.showOverlappingLabels);

    const handleOverlappingLabelsToggle = () => {
        const updatedSeries = allSeries.map((s) => {
            if (s.stack && s.type === CartesianSeriesType.BAR) {
                return {
                    ...s,
                    label: {
                        ...s.label,
                        showOverlappingLabels: !showOverlappingLabelsEnabled,
                    },
                };
            }
            return s;
        });
        updateSeries(updatedSeries);
    };

    const hasCustomColorsStacking =
        allSeries.some((series) => Boolean(series.stack)) ||
        (dirtyLayout?.stack !== undefined &&
            dirtyLayout.stack !== StackType.NONE);

    // Conditional formatting: available for all-bar charts without pivots,
    // regardless of how many metrics are charted or stacking. Mixed bar/line
    // charts are excluded since formatting only renders on bars.
    const supportsCustomColors =
        dirtyChartType === CartesianSeriesType.BAR &&
        allSeries.every((series) => series.type === CartesianSeriesType.BAR) &&
        !pivotDimensions?.length;

    // Color by category: only for single-series non-stacked bar charts
    const isSingleSeriesBar =
        supportsCustomColors &&
        allSeries.length <= 1 &&
        !hasCustomColorsStacking;

    const colorByCategory = dirtyLayout?.colorByCategory ?? false;
    const customColorsEnabled =
        colorByCategory || conditionalFormattings.length > 0;

    const hasMultipleSeries = (seriesGroupedByField?.length ?? 0) > 1;
    const canReorder = hasMultipleSeries && !sortedByPivot;

    return (
        <Stack gap="md">
            <ColorPaletteSection />
            <IncompletePeriodSection />
            <Divider />
            {hasMultipleSeries && (
                <SeriesDrawOrderBar
                    canReorder={canReorder}
                    onReverse={onReverseOrder}
                />
            )}
            <SortableList items={sortableGroupIds} onReorder={onReorder}>
                <div>
                    {seriesGroupedByField?.map((seriesGroup, i) => {
                        const isGroup = seriesGroup.value.length > 1;
                        const seriesEntry = seriesGroup.value[0];
                        const field = items.find(
                            (item) =>
                                getItemId(item) ===
                                seriesEntry.encode.yRef.field,
                        );

                        const hasDivider =
                            seriesGroupedByField.length !== i + 1;

                        const drawOrder = canReorder
                            ? {
                                  isFront:
                                      i === seriesGroupedByField.length - 1,
                                  onBringToFront: () => onBringToFront(i),
                              }
                            : undefined;

                        if (!field) {
                            return (
                                <Fragment key={i}>
                                    <InvalidSeriesConfiguration
                                        itemId={seriesEntry.encode.yRef.field}
                                    />
                                    {hasDivider && <Divider mt="md" mb="lg" />}
                                </Fragment>
                            );
                        }

                        return (
                            <SortableItem
                                key={groupIds[i]}
                                id={groupIds[i]}
                                disabled={sortedByPivot}
                            >
                                {(sortable) => (
                                    <div
                                        ref={sortable.ref}
                                        className={sortable.className}
                                        // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                                        style={sortable.style}
                                    >
                                        {isGroup ? (
                                            <GroupedSeriesConfiguration
                                                item={field}
                                                items={items}
                                                layout={dirtyLayout}
                                                seriesGroup={seriesGroup.value?.filter(
                                                    (s) => !s.isFilteredOut,
                                                )}
                                                updateSingleSeries={
                                                    updateSingleSeries
                                                }
                                                updateAllGroupedSeries={
                                                    updateAllGroupedSeries
                                                }
                                                dragHandleProps={
                                                    sortable.handleProps
                                                }
                                                isDragDisabled={sortedByPivot}
                                                drawOrder={drawOrder}
                                                updateSeries={updateSeries}
                                                getSingleSeries={
                                                    getSingleSeries
                                                }
                                                series={
                                                    dirtyEchartsConfig?.series?.filter(
                                                        (s) => !s.isFilteredOut,
                                                    ) || []
                                                }
                                            />
                                        ) : (
                                            <BasicSeriesConfiguration
                                                item={field}
                                                layout={dirtyLayout}
                                                isSingle={
                                                    seriesGroupedByField.length <=
                                                    1
                                                }
                                                series={seriesEntry}
                                                getSingleSeries={
                                                    getSingleSeries
                                                }
                                                updateSingleSeries={
                                                    updateSingleSeries
                                                }
                                                dragHandleProps={
                                                    sortable.handleProps
                                                }
                                                isDragDisabled={sortedByPivot}
                                                drawOrder={drawOrder}
                                                showColorPickerIcon={
                                                    colorByCategory
                                                }
                                            />
                                        )}
                                        {hasDivider && <Divider my="md" />}
                                    </div>
                                )}
                            </SortableItem>
                        );
                    })}
                </div>
            </SortableList>
            {supportsCustomColors && (
                <Config>
                    <Config.Section>
                        <Stack gap="xs">
                            <Switch
                                size="xs"
                                label="Apply custom colors"
                                checked={customColorsEnabled}
                                onChange={(e) => {
                                    if (e.currentTarget.checked) {
                                        if (conditionalFormattings.length > 0) {
                                            return;
                                        }
                                        if (isSingleSeriesBar) {
                                            setColorByCategory(true);
                                            return;
                                        }
                                        const firstYField =
                                            dirtyLayout?.yField?.[0];
                                        onSetConditionalFormattings([
                                            createConditionalFormattingConfigWithSingleColor(
                                                colorPalette[0],
                                                firstYField
                                                    ? { fieldId: firstYField }
                                                    : null,
                                            ),
                                        ]);
                                        return;
                                    }

                                    setColorByCategory(false);
                                    onSetConditionalFormattings([]);
                                }}
                            />
                            {customColorsEnabled && (
                                <CustomColors
                                    items={items}
                                    rows={resultsData?.rows}
                                    xField={dirtyLayout?.xField}
                                    yFields={dirtyLayout?.yField ?? []}
                                    canColorByCategory={isSingleSeriesBar}
                                    enforceSingleTarget={
                                        hasCustomColorsStacking
                                    }
                                    colorPalette={colorPalette}
                                    colorByCategory={colorByCategory}
                                    categoryColorOverrides={
                                        dirtyLayout?.categoryColorOverrides ??
                                        {}
                                    }
                                    conditionalFormattings={
                                        conditionalFormattings
                                    }
                                    setColorByCategory={setColorByCategory}
                                    setCategoryColorOverride={
                                        setCategoryColorOverride
                                    }
                                    setAllCategoryColorOverrides={
                                        setAllCategoryColorOverrides
                                    }
                                    onSetConditionalFormattings={
                                        onSetConditionalFormattings
                                    }
                                />
                            )}
                        </Stack>
                    </Config.Section>
                </Config>
            )}
            {hasStackedBars && (
                <Checkbox
                    size="xs"
                    checked={showOverlappingLabelsEnabled}
                    label="Show overlapping labels"
                    onChange={handleOverlappingLabelsToggle}
                />
            )}
        </Stack>
    );
};
