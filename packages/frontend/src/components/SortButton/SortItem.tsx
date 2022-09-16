import { Button, Icon } from '@blueprintjs/core';
import { isField, SortField } from '@lightdash/common';
import { forwardRef } from 'react';
import {
    DraggableProvidedDraggableProps,
    DraggableProvidedDragHandleProps,
} from 'react-beautiful-dnd';
import { ExplorerContext } from '../../providers/ExplorerProvider';
import {
    getSortDirectionOrder,
    getSortLabel,
    SortDirection,
} from '../../utils/sortUtils';
import { TableColumn } from '../common/Table/types';
import {
    ColumnNameWrapper,
    LabelWrapper,
    SortItemContainer,
    Spacer,
    StretchSpacer,
    StyledButtonGroup,
} from './SortButton.styles';

interface SortItemProps {
    isFirstItem: boolean;
    isOnlyItem: boolean;
    isDragging: boolean;
    isEditMode: boolean;
    sort: SortField;
    column?: TableColumn;
    draggableProps: DraggableProvidedDraggableProps;
    dragHandleProps?: DraggableProvidedDragHandleProps;
    onAddSortField: (
        options: Parameters<ExplorerContext['actions']['addSortField']>[1],
    ) => void;
    onRemoveSortField: () => void;
}

const SortItem = forwardRef<HTMLDivElement, SortItemProps>(
    (
        {
            isFirstItem,
            isOnlyItem,
            isDragging,
            isEditMode,
            sort,
            column,
            draggableProps,
            dragHandleProps,
            onAddSortField,
            onRemoveSortField,
        },
        ref,
    ) => {
        const selectedSortDirection = sort.descending
            ? SortDirection.DESC
            : SortDirection.ASC;

        const item = column?.meta?.item;

        if (!item) {
            return null;
        }

        return (
            <SortItemContainer
                ref={ref}
                {...draggableProps}
                $isDragging={isDragging}
            >
                {isEditMode && !isOnlyItem && (
                    <>
                        <Icon
                            tagName="div"
                            icon="drag-handle-vertical"
                            {...dragHandleProps}
                        />

                        <Spacer $width={6} />
                    </>
                )}

                <LabelWrapper>
                    {isFirstItem ? 'Sort by' : 'then by'}
                </LabelWrapper>

                <ColumnNameWrapper>
                    {(isField(item) ? item.label : item.name) || sort.fieldId}
                </ColumnNameWrapper>

                <StretchSpacer />

                <StyledButtonGroup>
                    {getSortDirectionOrder(item).map((direction) => (
                        <Button
                            key={direction}
                            small
                            disabled={!isEditMode}
                            active={direction === selectedSortDirection}
                            intent={
                                selectedSortDirection === direction
                                    ? 'primary'
                                    : 'none'
                            }
                            onClick={() =>
                                isEditMode
                                    ? selectedSortDirection === direction
                                        ? undefined
                                        : onAddSortField({
                                              descending:
                                                  direction ===
                                                  SortDirection.DESC,
                                          })
                                    : undefined
                            }
                        >
                            {getSortLabel(item, direction)}
                        </Button>
                    ))}
                </StyledButtonGroup>

                <Spacer $width={6} />

                {isEditMode && (
                    <Button
                        minimal
                        small
                        icon="small-cross"
                        onClick={() => {
                            onRemoveSortField();
                        }}
                    />
                )}
            </SortItemContainer>
        );
    },
);

export default SortItem;
