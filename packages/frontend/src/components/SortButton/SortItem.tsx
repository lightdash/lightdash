import { Button, ButtonGroup, Icon } from '@blueprintjs/core';
import { SortField } from '@lightdash/common';
import { forwardRef } from 'react';
import {
    DraggableProvidedDraggableProps,
    DraggableProvidedDragHandleProps,
} from 'react-beautiful-dnd';
import { TableColumn } from '../common/Table/types';
import {
    ColumnNameWrapper,
    LabelWrapper,
    SortItemContainer,
    Spacer,
    StretchSpacer,
} from './SortButton.styles';

interface SortItemProps {
    isFirstItem: boolean;
    isOnlyItem: boolean;
    isDragging: boolean;
    sort: SortField;
    column?: TableColumn;
    draggableProps: DraggableProvidedDraggableProps;
    dragHandleProps?: DraggableProvidedDragHandleProps;
}

const SortItem = forwardRef<HTMLDivElement, SortItemProps>(
    (
        {
            isFirstItem,
            isOnlyItem,
            isDragging,
            sort,
            column,
            draggableProps,
            dragHandleProps,
        },
        ref,
    ) => {
        const isDescending = !!sort.descending;
        const isAscending = !isDescending;

        return (
            <SortItemContainer
                ref={ref}
                {...draggableProps}
                $isDragging={isDragging}
            >
                <Button
                    minimal
                    small
                    icon="small-cross"
                    onClick={() => {
                        column?.meta?.onRemoveSort?.();
                    }}
                />

                <Spacer />

                <LabelWrapper>
                    {isFirstItem ? 'Sort by' : 'then by'}
                </LabelWrapper>

                <ColumnNameWrapper>
                    <b>{column?.columnLabel || sort.fieldId}</b>
                </ColumnNameWrapper>

                <StretchSpacer />

                <ButtonGroup>
                    <Button
                        small
                        intent={isAscending ? 'primary' : 'none'}
                        onClick={() =>
                            isAscending
                                ? undefined
                                : column?.meta?.onAddSort?.({
                                      descending: false,
                                  })
                        }
                    >
                        A-Z
                    </Button>

                    <Button
                        small
                        intent={isDescending ? 'primary' : 'none'}
                        onClick={() =>
                            isDescending
                                ? undefined
                                : column?.meta?.onAddSort?.({
                                      descending: true,
                                  })
                        }
                    >
                        Z-A
                    </Button>
                </ButtonGroup>

                <Spacer />

                {!isOnlyItem && (
                    <Icon
                        tagName="div"
                        icon="drag-handle-vertical"
                        {...dragHandleProps}
                    />
                )}
            </SortItemContainer>
        );
    },
);

export default SortItem;
