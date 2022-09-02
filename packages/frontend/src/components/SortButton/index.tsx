import { Tag } from '@blueprintjs/core';
import { Classes, Popover2 } from '@blueprintjs/popover2';
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
import {
    DroppableContainer,
    PopoverGlobalStyles,
    Spacer,
} from './SortButton.styles';
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
        if (result.destination.index === result.source.index) return;
        swapSortFields(result.source.index, result.destination.index);
    };

    return (
        <>
            <PopoverGlobalStyles />

            <Spacer $width={10} />

            <Popover2
                portalClassName="bp4-popover-portal-results-table-sort-fields"
                content={
                    <DragDropContext onDragEnd={onDragEnd}>
                        <Droppable droppableId="results-table-sort-fields">
                            {(dropProps) => (
                                <DroppableContainer
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
                                                        isFirstItem={
                                                            index === 0
                                                        }
                                                        isOnlyItem={
                                                            sorts.length === 1
                                                        }
                                                        isDragging={
                                                            snapshot.isDragging
                                                        }
                                                        draggableProps={
                                                            draggableProps
                                                        }
                                                        dragHandleProps={
                                                            dragHandleProps
                                                        }
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
                                </DroppableContainer>
                            )}
                        </Droppable>
                    </DragDropContext>
                }
                interactionKind="click"
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                position="bottom"
            >
                <Tag
                    large
                    round
                    minimal
                    interactive
                    intent="primary"
                    rightIcon="caret-down"
                >
                    Sorted by{' '}
                    {sorts.length === 1 ? '1 field' : `${sorts.length} fields`}
                </Tag>
            </Popover2>
        </>
    );
};

export default SortButton;
