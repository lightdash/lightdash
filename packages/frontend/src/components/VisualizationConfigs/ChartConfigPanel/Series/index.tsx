import {
    CustomDimension,
    Field,
    getDefaultSeriesColor,
    getItemId,
    getSeriesId,
    Series,
    TableCalculation,
} from '@lightdash/common';
import { Divider } from '@mantine/core';
import produce from 'immer';
import React, { FC, useCallback, useMemo } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableStateSnapshot,
    Droppable,
    DropResult,
} from 'react-beautiful-dnd';
import { createPortal } from 'react-dom';
import { getSeriesGroupedByField } from '../../../../hooks/cartesianChartConfig/utils';
import { isCartesianVisualizationConfig } from '../../../LightdashVisualization/VisualizationConfigCartesian';
import { useVisualizationContext } from '../../../LightdashVisualization/VisualizationProvider';
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

const SeriesTab: FC<Props> = ({ items }) => {
    const { visualizationConfig, colorPalette } = useVisualizationContext();

    const isCartesianChart =
        isCartesianVisualizationConfig(visualizationConfig);

    const chartConfig = useMemo(() => {
        if (!isCartesianChart) return;
        return visualizationConfig.chartConfig;
    }, [isCartesianChart, visualizationConfig]);

    const fallbackSeriesColours = useMemo(() => {
        if (!chartConfig) return;

        const dirtyEchartsConfig = chartConfig.dirtyEchartsConfig;

        return (dirtyEchartsConfig?.series || [])
            .filter(({ color }) => !color)
            .reduce<Record<string, string>>(
                (sum, series, index) => ({
                    ...sum,
                    [getSeriesId(series)]:
                        colorPalette[index] || getDefaultSeriesColor(index),
                }),
                {},
            );
    }, [chartConfig, colorPalette]);

    const getSeriesColor = useCallback(
        (seriesId: string) => {
            return fallbackSeriesColours?.[seriesId];
        },
        [fallbackSeriesColours],
    );

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
            const reorderedSeries = reorderedSeriesGroups.reduce<Series[]>(
                (acc, seriesGroup) => [
                    ...acc,
                    ...seriesGroup.value.map((s) => ({
                        ...s,
                        color: s.color || getSeriesColor(getSeriesId(s)),
                    })),
                ],
                [],
            );
            updateSeries(reorderedSeries);
        },
        [seriesGroupedByField, chartConfig, getSeriesColor],
    );

    if (!isCartesianChart) return null;

    const {
        dirtyEchartsConfig,
        dirtyLayout,
        updateSeries,
        updateSingleSeries,
        updateAllGroupedSeries,
    } = visualizationConfig.chartConfig;

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="results-table-sort-fields">
                {(dropProps) => (
                    <div {...dropProps.droppableProps} ref={dropProps.innerRef}>
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
                                    <>
                                        <InvalidSeriesConfiguration
                                            itemId={
                                                seriesEntry.encode.yRef.field
                                            }
                                        />
                                        {hasDivider && (
                                            <Divider mt="md" mb="lg" />
                                        )}
                                    </>
                                );
                            }

                            return (
                                <Draggable
                                    key={getSeriesId(seriesEntry)}
                                    draggableId={getSeriesId(seriesEntry)}
                                    index={i}
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
                                                        seriesGroup={
                                                            seriesGroup.value
                                                        }
                                                        getSeriesColor={
                                                            getSeriesColor
                                                        }
                                                        updateSingleSeries={
                                                            updateSingleSeries
                                                        }
                                                        updateAllGroupedSeries={
                                                            updateAllGroupedSeries
                                                        }
                                                        dragHandleProps={
                                                            dragHandleProps
                                                        }
                                                        updateSeries={
                                                            updateSeries
                                                        }
                                                        series={
                                                            dirtyEchartsConfig?.series ||
                                                            []
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
                                                        getSeriesColor={
                                                            getSeriesColor
                                                        }
                                                        updateSingleSeries={
                                                            updateSingleSeries
                                                        }
                                                        dragHandleProps={
                                                            dragHandleProps
                                                        }
                                                    />
                                                )}
                                                {hasDivider && (
                                                    <Divider mt="md" mb="lg" />
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
    );
};

export default SeriesTab;
