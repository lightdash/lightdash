import { Draggable } from '@hello-pangea/dnd';
import { isCustomDimension, isDimension, isField } from '@lightdash/common';
import { Tooltip, useMantineTheme } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';
import isEqual from 'lodash/isEqual';
import React, { useEffect, type FC } from 'react';
import {
    Th,
    ThActionsContainer,
    ThContainer,
    ThLabelContainer,
} from '../Table.styles';
import { useTableContext } from '../useTableContext';
import { HeaderDndContext, HeaderDroppable } from './HeaderDnD';

interface TableHeaderProps {
    minimal?: boolean;
    showSubtotals?: boolean;
}

const TableHeader: FC<TableHeaderProps> = ({
    minimal = false,
    showSubtotals = true,
}) => {
    const theme = useMantineTheme();
    const { table, headerContextMenu, columns } = useTableContext();
    const HeaderContextMenu = headerContextMenu;
    const currentColOrder = React.useRef<Array<string>>([]);

    useEffect(() => {
        if (showSubtotals) {
            const groupedColumns = columns
                .filter((col) => {
                    const item = col.meta?.item;
                    return (
                        item && (isDimension(item) || isCustomDimension(item))
                    );
                })
                .map((col) => col.id);

            const sortedColumns = table
                .getState()
                .columnOrder.reduce<string[]>((acc, sortedId) => {
                    return groupedColumns.includes(sortedId)
                        ? [...acc, sortedId]
                        : acc;
                }, [])
                // The last dimension column essentially groups rows for each unique value in that column.
                // Grouping on it would result in many useless expandable groups containing just one item.
                .slice(0, -1);

            if (!isEqual(sortedColumns, table.getState().grouping)) {
                table.setGrouping(sortedColumns);
            }
        } else {
            if (table.getState().grouping.length > 0) {
                table.resetGrouping();
            }
        }
    }, [showSubtotals, columns, headerContextMenu, table]);

    if (columns.length <= 0) {
        return null;
    }

    return (
        <thead data-testid="table-header">
            {table.getHeaderGroups().map((headerGroup) => (
                <HeaderDndContext
                    key={headerGroup.id}
                    colOrderRef={currentColOrder}
                >
                    <HeaderDroppable headerGroup={headerGroup}>
                        {headerGroup.headers.map((header) => {
                            const meta = header.column.columnDef.meta;
                            const tooltipLabel =
                                meta?.item && isField(meta?.item)
                                    ? meta.item.description
                                    : undefined;

                            return (
                                <Th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{
                                        ...meta?.style,
                                        width: meta?.width,
                                        backgroundColor:
                                            meta?.bgColor ??
                                            theme.colors.ldGray[0],
                                    }}
                                    className={meta?.className}
                                >
                                    <Draggable
                                        draggableId={header.id}
                                        index={header.index}
                                        isDragDisabled={
                                            minimal || !meta?.draggable
                                        }
                                    >
                                        {(provided, snapshot) => (
                                            <ThContainer>
                                                <ThLabelContainer
                                                    ref={provided.innerRef}
                                                    {...provided.draggableProps}
                                                    {...provided.dragHandleProps}
                                                    style={{
                                                        ...provided
                                                            .draggableProps
                                                            .style,
                                                        ...(!snapshot.isDragging && {
                                                            transform:
                                                                'translate(0,0)',
                                                        }),
                                                        ...(snapshot.isDropAnimating && {
                                                            transitionDuration:
                                                                '0.001s',
                                                        }),
                                                    }}
                                                >
                                                    <Tooltip
                                                        withinPortal
                                                        variant="xs"
                                                        openDelay={500}
                                                        maw={400}
                                                        multiline
                                                        label={tooltipLabel}
                                                        position="top"
                                                        disabled={
                                                            !tooltipLabel ||
                                                            minimal ||
                                                            snapshot.isDropAnimating ||
                                                            snapshot.isDragging
                                                        }
                                                    >
                                                        <span>
                                                            {header.isPlaceholder
                                                                ? null
                                                                : flexRender(
                                                                      header
                                                                          .column
                                                                          .columnDef
                                                                          .header,
                                                                      header.getContext(),
                                                                  )}
                                                        </span>
                                                    </Tooltip>
                                                </ThLabelContainer>

                                                {HeaderContextMenu &&
                                                    !meta?.isReadOnly && (
                                                        <ThActionsContainer>
                                                            <HeaderContextMenu
                                                                header={header}
                                                            />
                                                        </ThActionsContainer>
                                                    )}
                                            </ThContainer>
                                        )}
                                    </Draggable>
                                </Th>
                            );
                        })}
                    </HeaderDroppable>
                </HeaderDndContext>
            ))}
        </thead>
    );
};

export default TableHeader;
