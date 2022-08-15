import { Colors } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { isField } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React, { FC } from 'react';
import { Draggable } from 'react-beautiful-dnd';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';
import { HeaderDndContext, HeaderDroppable } from './HeaderDnD';
import SortIndicator from './SortIndicator';

const Dummy: FC = ({ children }) => <span>{children}</span>;

const TableHeader = () => {
    const { table, headerButton, headerContextMenu, columns } =
        useTableContext();
    const HeaderContextMenu = headerContextMenu || Dummy;
    const HeaderButton = headerButton || Dummy;
    const currentColOrder = React.useRef<Array<string>>([]);
    if (columns.length <= 0) {
        return null;
    }

    return (
        <>
            <thead>
                {table.getHeaderGroups().map((headerGroup) => (
                    <HeaderDndContext colOrderRef={currentColOrder}>
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
                                                <Tooltip2
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
                                                    <HeaderContextMenu
                                                        header={header}
                                                    >
                                                        <div
                                                            ref={
                                                                provided.innerRef
                                                            }
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
                                                                display: 'flex',
                                                                justifyContent:
                                                                    'space-between',
                                                            }}
                                                        >
                                                            {header.isPlaceholder
                                                                ? null
                                                                : flexRender(
                                                                      header
                                                                          .column
                                                                          .columnDef
                                                                          .header,
                                                                      header.getContext(),
                                                                  )}
                                                            {meta?.sort && (
                                                                <SortIndicator
                                                                    {...meta?.sort}
                                                                />
                                                            )}
                                                            <HeaderButton
                                                                header={header}
                                                            />
                                                        </div>
                                                    </HeaderContextMenu>
                                                </Tooltip2>
                                            )}
                                        </Draggable>
                                    </th>
                                );
                            })}
                        </HeaderDroppable>
                    </HeaderDndContext>
                ))}
            </thead>
        </>
    );
};

export default TableHeader;
