import { Button, Colors, Position } from '@blueprintjs/core';
import { Popover2, Tooltip2 } from '@blueprintjs/popover2';
import { isField } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React from 'react';
import { Draggable } from 'react-beautiful-dnd';
import { TableHeaderActionsContainer } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';
import { HeaderDndContext, HeaderDroppable } from './HeaderDnD';
import SortIndicator from './SortIndicator';

const TableHeader = () => {
    const { table, headerButton, headerContextMenu, columns } =
        useTableContext();
    const HeaderContextMenu = headerContextMenu;
    const HeaderButton = headerButton;
    const currentColOrder = React.useRef<Array<string>>([]);
    if (columns.length <= 0) {
        return null;
    }

    return (
        <thead>
            {table.getHeaderGroups().map((headerGroup) => (
                <HeaderDndContext
                    key={headerGroup.id}
                    colOrderRef={currentColOrder}
                >
                    <HeaderDroppable headerGroup={headerGroup}>
                        {headerGroup.headers.map((header) => {
                            const meta = header.column.columnDef
                                .meta as TableColumn['meta'];

                            return (
                                <th
                                    colSpan={header.colSpan}
                                    style={{
                                        width: meta?.width,
                                        backgroundColor:
                                            meta?.bgColor ?? Colors.GRAY5,
                                        cursor: meta?.onHeaderClick
                                            ? 'pointer'
                                            : undefined,
                                    }}
                                    onClick={meta?.onHeaderClick}
                                >
                                    <Draggable
                                        key={header.id}
                                        draggableId={header.id}
                                        index={header.index}
                                        isDragDisabled={!meta?.draggable}
                                    >
                                        {(provided, snapshot) => (
                                            <div
                                                ref={provided.innerRef}
                                                {...provided.draggableProps}
                                                {...provided.dragHandleProps}
                                                style={{
                                                    ...provided.draggableProps
                                                        .style,
                                                    ...(!snapshot.isDragging && {
                                                        transform:
                                                            'translate(0,0)',
                                                    }),
                                                    ...(snapshot.isDropAnimating && {
                                                        transitionDuration:
                                                            '0.001s',
                                                    }),
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent:
                                                        'space-between',
                                                }}
                                            >
                                                <Tooltip2
                                                    lazy
                                                    fill
                                                    content={
                                                        meta?.item &&
                                                        isField(meta?.item)
                                                            ? meta.item
                                                                  .description
                                                            : undefined
                                                    }
                                                    position="top"
                                                    disabled={
                                                        snapshot.isDropAnimating ||
                                                        snapshot.isDragging
                                                    }
                                                >
                                                    {header.isPlaceholder
                                                        ? null
                                                        : flexRender(
                                                              header.column
                                                                  .columnDef
                                                                  .header,
                                                              header.getContext(),
                                                          )}
                                                </Tooltip2>

                                                <TableHeaderActionsContainer
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                    }}
                                                >
                                                    {meta?.sort && (
                                                        <SortIndicator
                                                            {...meta?.sort}
                                                        />
                                                    )}

                                                    {HeaderButton && (
                                                        <HeaderButton
                                                            header={header}
                                                        />
                                                    )}

                                                    {meta?.item &&
                                                        HeaderContextMenu && (
                                                            <Popover2
                                                                lazy
                                                                minimal
                                                                position={
                                                                    Position.BOTTOM_RIGHT
                                                                }
                                                                content={
                                                                    <HeaderContextMenu
                                                                        header={
                                                                            header
                                                                        }
                                                                    />
                                                                }
                                                            >
                                                                <Button
                                                                    minimal
                                                                    small
                                                                    icon="more"
                                                                />
                                                            </Popover2>
                                                        )}
                                                </TableHeaderActionsContainer>
                                            </div>
                                        )}
                                    </Draggable>
                                </th>
                            );
                        })}
                    </HeaderDroppable>
                </HeaderDndContext>
            ))}
        </thead>
    );
};

export default TableHeader;
