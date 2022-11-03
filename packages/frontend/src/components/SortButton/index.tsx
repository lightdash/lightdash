import { Position, Tag } from '@blueprintjs/core';
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
import { DroppableContainer, PopoverGlobalStyles } from './SortButton.styles';
import SortItem from './SortItem';

type Props = {
    sorts: SortField[];
    isEditMode: boolean;
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

const SortButton: FC<Props> = ({ sorts, isEditMode }) => {
    const columns = useColumns();

    const addSortField = useExplorerContext(
        (context) => context.actions.addSortField,
    );
    const removeSortField = useExplorerContext(
        (context) => context.actions.removeSortField,
    );
    const moveSortFields = useExplorerContext(
        (context) => context.actions.moveSortFields,
    );

    const onDragEnd = (result: DropResult) => {
        if (!result.destination) return;
        if (result.destination.index === result.source.index) return;
        moveSortFields(result.source.index, result.destination.index);
    };

    return (
        <>
            <PopoverGlobalStyles />

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
                                            isDragDisabled={!isEditMode}
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
                                                        isEditMode={isEditMode}
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
                                                        onAddSortField={(
                                                            options,
                                                        ) => {
                                                            addSortField(
                                                                sort.fieldId,
                                                                options,
                                                            );
                                                        }}
                                                        onRemoveSortField={() => {
                                                            removeSortField(
                                                                sort.fieldId,
                                                            );
                                                        }}
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
                interactionKind={isEditMode ? 'click' : 'hover'}
                popoverClassName={Classes.POPOVER2_CONTENT_SIZING}
                position={Position.BOTTOM}
            >
                <Tag
                    large
                    round
                    minimal
                    intent="primary"
                    interactive={isEditMode}
                    rightIcon={isEditMode ? 'caret-down' : null}
                >
                    Sorted by{' '}
                    {sorts.length === 1 ? '1 field' : `${sorts.length} fields`}
                </Tag>
            </Popover2>
        </>
    );
};

export default SortButton;
