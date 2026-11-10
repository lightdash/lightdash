import { Box } from '@mantine/core';
import { type ReactNode } from 'react';
import {
    SortableItem,
    SortableList,
    type SortableHandleProps,
} from '../../common/Sortable/Sortable';
import {
    SeriesDrawOrderBar,
    type SeriesDrawOrderControl,
} from '../../VisualizationConfigs/ChartConfigPanel/Series/SeriesDrawOrder';

type Props = {
    order: string[];
    onChange: (order: string[]) => void;
    children: (
        reference: string,
        dragHandleProps: SortableHandleProps | null,
        drawOrder: SeriesDrawOrderControl | undefined,
    ) => ReactNode;
};

export const SeriesOrderList = ({ order, onChange, children }: Props) => {
    const canReorder = order.length > 1;
    const move = (from: number, to: number) => {
        const nextOrder = [...order];
        const [moved] = nextOrder.splice(from, 1);
        nextOrder.splice(to, 0, moved);
        onChange(nextOrder);
    };

    return (
        <>
            {canReorder && (
                <SeriesDrawOrderBar
                    canReorder={canReorder}
                    onReverse={() => onChange([...order].reverse())}
                />
            )}
            <SortableList items={order} onReorder={move}>
                {order.map((reference, index) => (
                    <SortableItem
                        key={reference}
                        id={reference}
                        disabled={!canReorder}
                    >
                        {(sortable) => (
                            <Box
                                ref={sortable.ref}
                                className={sortable.className}
                                // oxlint-disable-next-line lightdash-ui/no-inline-style-prop
                                style={sortable.style}
                                mt="xs"
                            >
                                {children(
                                    reference,
                                    canReorder ? sortable.handleProps : null,
                                    canReorder
                                        ? {
                                              isFront:
                                                  index === order.length - 1,
                                              onBringToFront: () =>
                                                  move(index, order.length - 1),
                                          }
                                        : undefined,
                                )}
                            </Box>
                        )}
                    </SortableItem>
                ))}
            </SortableList>
        </>
    );
};
