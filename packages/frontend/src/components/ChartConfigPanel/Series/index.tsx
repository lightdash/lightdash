import {
    Field,
    getDefaultSeriesColor,
    getItemId,
    getSeriesId,
    TableCalculation,
} from '@lightdash/common';
import React, { FC, useCallback, useMemo } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableStateSnapshot,
    Droppable,
    DropResult,
} from 'react-beautiful-dnd';
import { createPortal } from 'react-dom';
import { getSeriesGroupedByField } from '../../../hooks/cartesianChartConfig/utils';
import { useOrganisation } from '../../../hooks/organisation/useOrganisation';
import { useVisualizationContext } from '../../LightdashVisualization/VisualizationProvider';
import BasicSeriesConfiguration from './BasicSeriesConfiguration';
import GroupedSeriesConfiguration from './GroupedSeriesConfiguration';
import InvalidSeriesConfiguration from './InvalidSeriesConfiguration';
import { SeriesDivider } from './Series.styles';

type DraggablePortalHandlerProps = {
    snapshot: DraggableStateSnapshot;
};

const DraggablePortalHandler: FC<DraggablePortalHandlerProps> = ({
    children,
    snapshot,
}) => {
    if (snapshot.isDragging) return createPortal(children, document.body);
    return <>{children}</>;
};

type Props = {
    items: (Field | TableCalculation)[];
};

const SeriesTab: FC<Props> = ({ items }) => {
    const {
        cartesianConfig: {
            dirtyLayout,
            dirtyEchartsConfig,
            updateSingleSeries,
            updateAllGroupedSeries,
            updateSingleSeriesOrder,
            updateAllGroupedSeriesOrder,
        },
    } = useVisualizationContext();
    const { data: orgData } = useOrganisation({ refetchOnMount: false });

    const fallbackSeriesColours = useMemo(() => {
        return (dirtyEchartsConfig?.series || [])
            .filter(({ color }) => !color)
            .reduce<Record<string, string>>(
                (sum, series, index) => ({
                    ...sum,
                    [getSeriesId(series)]:
                        (orgData?.chartColors && orgData?.chartColors[index]) ||
                        getDefaultSeriesColor(index),
                }),
                {},
            );
    }, [dirtyEchartsConfig, orgData]);

    const getSeriesColor = useCallback(
        (seriesId: string) => {
            return fallbackSeriesColours[seriesId];
        },
        [fallbackSeriesColours],
    );

    const { series } = dirtyEchartsConfig || {};

    const seriesGroupedByField = useMemo(() => {
        return getSeriesGroupedByField(series || []);
    }, [series]);

    const onDragEnd = useCallback(
        (result: DropResult) => {
            if (!result.destination) return;
            if (result.destination.index === result.source.index) return;

            const sourceSeriesGroup = seriesGroupedByField[result.source.index];
            const destinationSeriesGroup =
                seriesGroupedByField[result.destination.index];
            const isGroup = sourceSeriesGroup.value.length > 1;
            const destinationIndex =
                result.destination.index < result.source.index
                    ? destinationSeriesGroup.index
                    : destinationSeriesGroup.index +
                      destinationSeriesGroup.value.length -
                      1;
            if (isGroup) {
                updateAllGroupedSeriesOrder(
                    sourceSeriesGroup.value[0].encode.yRef.field,
                    destinationIndex,
                );
            } else {
                updateSingleSeriesOrder(
                    seriesGroupedByField[result.source.index].index,
                    destinationIndex,
                );
            }
        },
        [
            seriesGroupedByField,
            updateAllGroupedSeriesOrder,
            updateSingleSeriesOrder,
        ],
    );

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
                                        {hasDivider && <SeriesDivider />}
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
                                                    <div
                                                        style={{
                                                            display: 'flex',
                                                        }}
                                                    >
                                                        <SeriesDivider />
                                                    </div>
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
