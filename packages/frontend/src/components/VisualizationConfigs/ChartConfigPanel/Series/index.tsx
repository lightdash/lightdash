import {
    DragDropContext,
    Draggable,
    Droppable,
    type DraggableStateSnapshot,
    type DropResult,
} from '@hello-pangea/dnd';
import {
    CartesianSeriesType,
    getItemId,
    getSeriesId,
    type CustomDimension,
    type Field,
    type Series as SeriesType,
    type TableCalculation,
} from '@lightdash/common';
import { ScrollArea } from '@mantine-8/core';
import {
    Box,
    Checkbox,
    Divider,
    Group,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { produce } from 'immer';
import React, {
    Fragment,
    useCallback,
    useMemo,
    useState,
    type FC,
} from 'react';
import { createPortal } from 'react-dom';
import { getSeriesGroupedByField } from '../../../../hooks/cartesianChartConfig/utils';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/types';
import { useVisualizationContext } from '../../../LightdashVisualization/useVisualizationContext';
import ColorSelector from '../../ColorSelector';
import BasicSeriesConfiguration from './BasicSeriesConfiguration';
import GroupedSeriesConfiguration from './GroupedSeriesConfiguration';
import InvalidSeriesConfiguration from './InvalidSeriesConfiguration';

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

const DraggablePortalHandler: FC<
    React.PropsWithChildren<DraggablePortalHandlerProps>
> = ({ children, snapshot }) => {
    if (snapshot.isDragging) return createPortal(children, document.body);
    return <>{children}</>;
};

type Props = {
    items: (Field | TableCalculation | CustomDimension)[];
};

const MAX_COLOR_VALUES = 50;

export const Series: FC<Props> = ({ items }) => {
    const {
        visualizationConfig,
        getSeriesColor,
        pivotDimensions,
        resultsData,
        colorPalette,
    } = useVisualizationContext();

    const sortedByPivot = useMemo(
        () =>
            !!pivotDimensions?.length &&
            !!resultsData?.metricQuery?.sorts?.some((sort) =>
                pivotDimensions.includes(sort.fieldId),
            ),
        [pivotDimensions, resultsData?.metricQuery?.sorts],
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

    const onDragEnd = useCallback(
        (result: DropResult) => {
            if (!chartConfig || !seriesGroupedByField) return;

            const { updateSeries } = chartConfig;

            if (!result.destination) return;
            if (result.destination.index === result.source.index) return;
            const sourceIndex = result.source.index;
            const destinationIndex = result.destination.index;
            const reorderedSeriesGroups = produce(
                seriesGroupedByField,
                (newState) => {
                    const [removed] = newState.splice(sourceIndex, 1);
                    newState.splice(destinationIndex, 0, removed);
                },
            );
            const reorderedSeries = reorderedSeriesGroups.reduce<SeriesType[]>(
                (acc, seriesGroup) => [
                    ...acc,
                    ...seriesGroup.value.map((s) => ({
                        ...s,
                        color: getSeriesColor(s),
                    })),
                ],
                [],
            );
            updateSeries(reorderedSeries);
        },
        [seriesGroupedByField, chartConfig, getSeriesColor],
    );

    // Collect unique category values using raw values as keys (matching echarts dataset)
    // and formatted values for display labels
    const { uniqueCategories, allRawKeys, remainingCount } = useMemo(() => {
        if (!isCartesianChart)
            return { uniqueCategories: [], allRawKeys: [], remainingCount: 0 };

        const {
            dirtyLayout: layout,
            dirtyChartType: chartType,
            dirtyEchartsConfig: echartsConfig,
        } = visualizationConfig.chartConfig;
        const series = echartsConfig?.series ?? [];

        const isSingle =
            chartType === CartesianSeriesType.BAR &&
            !pivotDimensions?.length &&
            series.length <= 1;

        if (!isSingle || !layout?.colorByCategory || !resultsData?.rows)
            return { uniqueCategories: [], allRawKeys: [], remainingCount: 0 };

        const xField = layout.xField;
        if (!xField)
            return { uniqueCategories: [], allRawKeys: [], remainingCount: 0 };

        const seen = new Map<string, string>(); // raw -> formatted
        for (const row of resultsData.rows) {
            const cell = row[xField];
            if (cell?.value != null) {
                const rawKey = String(cell.value.raw ?? cell.value.formatted);
                if (!seen.has(rawKey)) {
                    seen.set(
                        rawKey,
                        String(cell.value.formatted ?? cell.value.raw),
                    );
                }
            }
        }
        const entries = Array.from(seen.entries());
        return {
            uniqueCategories: entries.slice(0, MAX_COLOR_VALUES),
            allRawKeys: Array.from(seen.keys()),
            remainingCount: Math.max(0, entries.length - MAX_COLOR_VALUES),
        };
    }, [
        isCartesianChart,
        visualizationConfig,
        pivotDimensions,
        resultsData?.rows,
    ]);

    const [setAllColor, setSetAllColor] = useState<string | undefined>();

    // When colorByCategory is on, the top-level series color picker sets all categories
    const handleSetAllCategoryColors = useCallback(
        (color: string) => {
            if (!isCartesianChart) return;
            setSetAllColor(color);
            const overrides: Record<string, string> = {};
            for (const rawKey of allRawKeys) {
                overrides[rawKey] = color;
            }
            visualizationConfig.chartConfig.setAllCategoryColorOverrides(
                overrides,
            );
        },
        [isCartesianChart, allRawKeys, visualizationConfig],
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

    // Color by category: available for single-series bar charts without pivots
    const isSingleSeriesBar =
        dirtyChartType === CartesianSeriesType.BAR &&
        !pivotDimensions?.length &&
        allSeries.length <= 1;

    const colorByCategory = dirtyLayout?.colorByCategory ?? false;
    const categoryColorOverrides = dirtyLayout?.categoryColorOverrides ?? {};
    const hasHighlightedSeries = allSeries.some((series) => series.highlight);
    const showColorByCategoryOption =
        isSingleSeriesBar && !hasHighlightedSeries;
    return (
        <Stack spacing="md">
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="results-table-sort-fields">
                    {(dropProps) => (
                        <div
                            {...dropProps.droppableProps}
                            ref={dropProps.innerRef}
                        >
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

                                if (!field) {
                                    return (
                                        <Fragment key={i}>
                                            <InvalidSeriesConfiguration
                                                itemId={
                                                    seriesEntry.encode.yRef
                                                        .field
                                                }
                                            />
                                            {hasDivider && (
                                                <Divider mt="md" mb="lg" />
                                            )}
                                        </Fragment>
                                    );
                                }

                                return (
                                    <Draggable
                                        key={getSeriesId(seriesEntry)}
                                        draggableId={getSeriesId(seriesEntry)}
                                        index={i}
                                        isDragDisabled={sortedByPivot}
                                    >
                                        {(
                                            {
                                                draggableProps,
                                                dragHandleProps,
                                                innerRef,
                                            },
                                            snapshot,
                                        ) => (
                                            <DraggablePortalHandler
                                                snapshot={snapshot}
                                            >
                                                <div
                                                    ref={innerRef}
                                                    {...draggableProps}
                                                >
                                                    {isGroup ? (
                                                        <GroupedSeriesConfiguration
                                                            item={field}
                                                            items={items}
                                                            layout={dirtyLayout}
                                                            seriesGroup={seriesGroup.value?.filter(
                                                                (s) =>
                                                                    !s.isFilteredOut,
                                                            )}
                                                            updateSingleSeries={
                                                                updateSingleSeries
                                                            }
                                                            updateAllGroupedSeries={
                                                                updateAllGroupedSeries
                                                            }
                                                            dragHandleProps={
                                                                dragHandleProps
                                                            }
                                                            isDragDisabled={
                                                                sortedByPivot
                                                            }
                                                            updateSeries={
                                                                updateSeries
                                                            }
                                                            getSingleSeries={
                                                                getSingleSeries
                                                            }
                                                            series={
                                                                dirtyEchartsConfig?.series?.filter(
                                                                    (s) =>
                                                                        !s.isFilteredOut,
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
                                                                dragHandleProps
                                                            }
                                                            isDragDisabled={
                                                                sortedByPivot
                                                            }
                                                            showColorPickerIcon={
                                                                colorByCategory
                                                            }
                                                        />
                                                    )}
                                                    {showColorByCategoryOption && (
                                                        <Stack
                                                            spacing="xs"
                                                            mt="xs"
                                                            ml="lg"
                                                        >
                                                            <Switch
                                                                label="Color by category"
                                                                checked={
                                                                    colorByCategory
                                                                }
                                                                onChange={(e) =>
                                                                    setColorByCategory(
                                                                        e
                                                                            .currentTarget
                                                                            .checked,
                                                                    )
                                                                }
                                                            />
                                                            {colorByCategory &&
                                                                uniqueCategories.length >
                                                                    0 && (
                                                                    <>
                                                                        <Divider />
                                                                        <Group
                                                                            spacing="xs"
                                                                            noWrap
                                                                        >
                                                                            <ColorSelector
                                                                                color={
                                                                                    setAllColor ??
                                                                                    colorPalette[0]
                                                                                }
                                                                                swatches={
                                                                                    colorPalette
                                                                                }
                                                                                onColorChange={
                                                                                    handleSetAllCategoryColors
                                                                                }
                                                                            />
                                                                            <Text
                                                                                fz="xs"
                                                                                fw={
                                                                                    600
                                                                                }
                                                                                c="dimmed"
                                                                            >
                                                                                Set
                                                                                all
                                                                            </Text>
                                                                        </Group>
                                                                        <Box
                                                                            bg="ldGray.1"
                                                                            p="xxs"
                                                                            py="xs"
                                                                            sx={(
                                                                                theme,
                                                                            ) => ({
                                                                                borderRadius:
                                                                                    theme
                                                                                        .radius
                                                                                        .sm,
                                                                            })}
                                                                        >
                                                                            <ScrollArea.Autosize
                                                                                mah={
                                                                                    300
                                                                                }
                                                                            >
                                                                                <Stack spacing="xs">
                                                                                    {uniqueCategories.map(
                                                                                        (
                                                                                            [
                                                                                                rawKey,
                                                                                                label,
                                                                                            ],
                                                                                            idx,
                                                                                        ) => (
                                                                                            <Group
                                                                                                key={
                                                                                                    rawKey
                                                                                                }
                                                                                                spacing="xs"
                                                                                                noWrap
                                                                                            >
                                                                                                <ColorSelector
                                                                                                    color={
                                                                                                        categoryColorOverrides[
                                                                                                            rawKey
                                                                                                        ] ??
                                                                                                        colorPalette[
                                                                                                            idx %
                                                                                                                colorPalette.length
                                                                                                        ]
                                                                                                    }
                                                                                                    swatches={
                                                                                                        colorPalette
                                                                                                    }
                                                                                                    onColorChange={(
                                                                                                        c,
                                                                                                    ) =>
                                                                                                        setCategoryColorOverride(
                                                                                                            rawKey,
                                                                                                            c,
                                                                                                        )
                                                                                                    }
                                                                                                />
                                                                                                <Text
                                                                                                    fz="xs"
                                                                                                    truncate
                                                                                                >
                                                                                                    {
                                                                                                        label
                                                                                                    }
                                                                                                </Text>
                                                                                            </Group>
                                                                                        ),
                                                                                    )}
                                                                                    {remainingCount >
                                                                                        0 && (
                                                                                        <Text
                                                                                            fz="xs"
                                                                                            c="dimmed"
                                                                                            fs="italic"
                                                                                        >
                                                                                            {
                                                                                                remainingCount
                                                                                            }{' '}
                                                                                            more
                                                                                            colored
                                                                                            automatically
                                                                                        </Text>
                                                                                    )}
                                                                                </Stack>
                                                                            </ScrollArea.Autosize>
                                                                        </Box>
                                                                    </>
                                                                )}
                                                        </Stack>
                                                    )}
                                                    {hasDivider && (
                                                        <Divider my="md" />
                                                    )}
                                                </div>
                                            </DraggablePortalHandler>
                                        )}
                                    </Draggable>
                                );
                            })}
                            {dropProps.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
            {hasStackedBars && (
                <Checkbox
                    checked={showOverlappingLabelsEnabled}
                    label="Show overlapping labels"
                    onChange={handleOverlappingLabelsToggle}
                />
            )}
        </Stack>
    );
};
