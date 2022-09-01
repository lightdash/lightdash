import { Button } from '@blueprintjs/core';
import { Classes } from '@blueprintjs/popover2';
import { SortField } from '@lightdash/common';
import { FC } from 'react';
import {
    DragDropContext,
    Draggable,
    DraggableStateSnapshot,
    Droppable,
    DropResult,
} from 'react-beautiful-dnd';
import { createPortal } from 'react-dom';
import { useColumns } from '../../hooks/useColumns';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { StyledPopover } from './SortButton.styles';
import SortItem from './SortItem';

type Props = {
    sorts: SortField[];
};

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

const SortButton: FC<Props> = ({ sorts }) => {
    const columns = useColumns();
    const swapSortFields = useExplorerContext(
        (context) => context.actions.swapSortFields,
    );

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        swapSortFields(result.source.index, result.destination.index);
    };

    return (
        <StyledPopover
            content={
                <DragDropContext onDragEnd={onDragEnd}>
                    <Droppable droppableId="results-table-sort-fields">
                        {(dropProps) => (
                            <div
                                {...dropProps.droppableProps}
                                ref={dropProps.innerRef}
                            >
                                {sorts.map((sort, index) => (
                                    <Draggable
                                        key={sort.fieldId}
                                        draggableId={sort.fieldId}
                                        index={index}
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
                                                <SortItem
                                                    ref={innerRef}
                                                    draggableProps={
                                                        draggableProps
                                                    }
                                                    dragHandleProps={
                                                        dragHandleProps
                                                    }
                                                    isFirstItem={index === 0}
                                                    sort={sort}
                                                    column={columns.find(
                                                        (c) =>
                                                            c.id ===
                                                            sort.fieldId,
                                                    )}
                                                />
                                            </DraggablePortalHandler>
                                        )}
                                    </Draggable>
                                ))}

                                {dropProps.placeholder}
                            </div>
                        )}
                    </Droppable>
                </DragDropContext>
            }
            interactionKind="click"
            popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
            position="bottom"
        >
            <Button
                minimal
                rightIcon="caret-down"
                text={`Sorted by ${
                    sorts.length === 1 ? '1 field' : `${sorts.length} fields`
                }`}
            />
        </StyledPopover>
    );
};

export default SortButton;
