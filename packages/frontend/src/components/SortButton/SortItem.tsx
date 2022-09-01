import { Button, ButtonGroup } from '@blueprintjs/core';
import { SortField } from '@lightdash/common';
import { forwardRef } from 'react';
import {
    DraggableProvidedDraggableProps,
    DraggableProvidedDragHandleProps,
} from 'react-beautiful-dnd';
import { TableColumn } from '../common/Table/types';
import {
    LabelWrapper,
    SortItemContainer,
    StretchDivider,
    StyledIcon,
    StyledXButton,
} from './SortButton.styles';

interface SortItemProps {
    isFirstItem: boolean;
    sort: SortField;
    column?: TableColumn;
    draggableProps: DraggableProvidedDraggableProps;
    dragHandleProps?: DraggableProvidedDragHandleProps;
}

const SortItem = forwardRef<HTMLDivElement, SortItemProps>(
    ({ isFirstItem, sort, column, draggableProps, dragHandleProps }, ref) => {
        const isDescending = !!sort.descending;
        const isAscending = !isDescending;

        return (
            <SortItemContainer ref={ref} {...draggableProps}>
                <StyledIcon icon="drag-handle-vertical" {...dragHandleProps} />

                <LabelWrapper>
                    {isFirstItem ? 'Sort by' : 'then by'}{' '}
                    <b>{column?.columnLabel || sort.fieldId}</b>
                </LabelWrapper>

                <StretchDivider />

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

                <StyledXButton
                    minimal
                    small
                    icon="small-cross"
                    onClick={() => {
                        column?.meta?.onRemoveSort?.();
                    }}
                />
            </SortItemContainer>
        );
    },
);

export default SortItem;
