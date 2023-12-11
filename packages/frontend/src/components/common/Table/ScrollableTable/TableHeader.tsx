import { Tooltip2 } from '@blueprintjs/popover2';
import { isField } from '@lightdash/common';
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
    const table = useTableContext((context) => context.table);
    const columns = useTableContext((context) => context.columns);
    const headerContextMenu = useTableContext(
        (context) => context.headerContextMenu,
    );

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
                                                            minimal ||
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
