import {
    DragDropContext,
    Draggable,
    Droppable,
    type DraggableProvidedDragHandleProps,
    type DropResult,
} from '@hello-pangea/dnd';
import { Box } from '@mantine/core';
import { useId, type ReactNode } from 'react';
import {
    SeriesDrawOrderBar,
    type SeriesDrawOrderControl,
} from '../../VisualizationConfigs/ChartConfigPanel/Series/SeriesDrawOrder';
import { DraggablePortalHandler } from '../../VisualizationConfigs/TreemapConfig/DraggablePortalHandler';

type Props = {
    order: string[];
    onChange: (order: string[]) => void;
    children: (
        reference: string,
        dragHandleProps: DraggableProvidedDragHandleProps | null,
        drawOrder: SeriesDrawOrderControl | undefined,
    ) => ReactNode;
};

export const SeriesOrderList = ({ order, onChange, children }: Props) => {
    const droppableId = useId();
    const canReorder = order.length > 1;
    const move = (from: number, to: number) => {
        const nextOrder = [...order];
        const [moved] = nextOrder.splice(from, 1);
        nextOrder.splice(to, 0, moved);
        onChange(nextOrder);
    };
    const onDragEnd = ({ source, destination }: DropResult) => {
        if (!destination || source.index === destination.index) return;
        move(source.index, destination.index);
    };

    return (
        <>
            {canReorder && (
                <SeriesDrawOrderBar
                    canReorder={canReorder}
                    onReverse={() => onChange([...order].reverse())}
                />
            )}
            <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId={droppableId}>
                    {(dropProps) => (
                        <Box
                            {...dropProps.droppableProps}
                            ref={dropProps.innerRef}
                        >
                            {order.map((reference, index) => (
                                <Draggable
                                    key={reference}
                                    draggableId={reference}
                                    index={index}
                                    isDragDisabled={!canReorder}
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
                                            <Box
                                                {...draggableProps}
                                                ref={innerRef}
                                                mt="xs"
                                            >
                                                {children(
                                                    reference,
                                                    dragHandleProps,
                                                    canReorder
                                                        ? {
                                                              isFront:
                                                                  index ===
                                                                  order.length -
                                                                      1,
                                                              onBringToFront:
                                                                  () =>
                                                                      move(
                                                                          index,
                                                                          order.length -
                                                                              1,
                                                                      ),
                                                          }
                                                        : undefined,
                                                )}
                                            </Box>
                                        </DraggablePortalHandler>
                                    )}
                                </Draggable>
                            ))}
                            {dropProps.placeholder}
                        </Box>
                    )}
                </Droppable>
            </DragDropContext>
        </>
    );
};
