import { isField } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';
import React, { FC } from 'react';
import { Draggable } from 'react-beautiful-dnd';
import {
    TABLE_HEADER_BG,
    Th,
    ThActionsContainer,
    ThContainer,
    ThLabelContainer,
} from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { HeaderDndContext, HeaderDroppable } from './HeaderDnD';

interface TableHeaderProps {
    minimal?: boolean;
}

const TableHeader: FC<TableHeaderProps> = ({ minimal = false }) => {
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
                                        ...meta?.style,
                                        width: meta?.width,
                                        backgroundColor:
                                            meta?.bgColor ?? TABLE_HEADER_BG,
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
                                                        maw={400}
                                                        multiline
                                                        label={
                                                            meta?.item &&
                                                            isField(meta?.item)
                                                                ? meta.item
                                                                      .description
                                                                : undefined
                                                        }
                                                        position="top"
                                                        disabled={
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

                                                {HeaderContextMenu && (
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
