import { Button, ButtonGroup, Icon } from '@blueprintjs/core';
import { isField, SortField } from '@lightdash/common';
import { forwardRef } from 'react';
import {
    DraggableProvidedDraggableProps,
    DraggableProvidedDragHandleProps,
} from 'react-beautiful-dnd';
import { ExplorerContext } from '../../providers/ExplorerProvider';
import { getSortLabel, SortDirection } from '../../utils/sortUtils';
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
            sort,
            column,
            draggableProps,
            dragHandleProps,
            onAddSortField,
            onRemoveSortField,
        },
        ref,
    ) => {
        const isDescending = !!sort.descending;
        const isAscending = !isDescending;

        const item = column?.meta?.item;

        return (
            <SortItemContainer
                ref={ref}
                {...draggableProps}
                $isDragging={isDragging}
            >
                {!isOnlyItem && (
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
                    {isField(item) ? item.label : item?.name || sort.fieldId}
                </ColumnNameWrapper>

                <StretchSpacer />

                <ButtonGroup>
                    <Button
                        small
                        intent={isAscending ? 'primary' : 'none'}
                        onClick={() =>
                            isAscending
                                ? undefined
                                : onAddSortField({ descending: false })
                        }
                    >
                        {getSortLabel(item, SortDirection.ASC)}
                    </Button>

                    <Button
                        small
                        intent={isDescending ? 'primary' : 'none'}
                        onClick={() =>
                            isDescending
                                ? undefined
                                : onAddSortField({ descending: true })
                        }
                    >
                        {getSortLabel(item, SortDirection.DESC)}
                    </Button>
                </ButtonGroup>

                <Spacer $width={6} />

                <Button
                    minimal
                    small
                    icon="small-cross"
                    onClick={() => {
                        onRemoveSortField();
                    }}
                />
            </SortItemContainer>
        );
    },
);

export default SortItem;
