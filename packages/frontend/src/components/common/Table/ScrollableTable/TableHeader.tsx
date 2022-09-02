import { Colors } from '@blueprintjs/core';
import { Tooltip2 } from '@blueprintjs/popover2';
import { isField } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React from 'react';
import { Draggable } from 'react-beautiful-dnd';
import {
    Th,
    ThActionsContainer,
    ThContainer,
    ThLabelContainer,
} from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { HeaderDndContext, HeaderDroppable } from './HeaderDnD';

const TableHeader = () => {
    const { table, headerContextMenu, columns } = useTableContext();
    const HeaderContextMenu = headerContextMenu;
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
                            const meta = header.column.columnDef.meta;

                            return (
                                <Th
                                    key={header.id}
                                    colSpan={header.colSpan}
                                    style={{
                                        width: meta?.width,
                                        backgroundColor:
                                            meta?.bgColor ?? Colors.GRAY5,
                                    }}
                                >
                                    <Draggable
                                        draggableId={header.id}
                                        index={header.index}
                                        isDragDisabled={!meta?.draggable}
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
                                                </ThLabelContainer>

                                                <ThActionsContainer>
                                                    {meta?.item &&
                                                        HeaderContextMenu && (
                                                            <HeaderContextMenu
                                                                header={header}
                                                            />
                                                        )}
                                                </ThActionsContainer>
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
