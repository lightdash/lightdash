import { isField, isTableCalculation } from '@lightdash/common';
import { Tooltip } from '@mantine/core';
import { flexRender } from '@tanstack/react-table';
import { isEqual } from 'es-toolkit/compat';
import React, { useEffect, type FC } from 'react';
import { SortableItem } from '../../Sortable/Sortable';
import { ROW_NUMBER_COLUMN_ID } from '../constants';
import { getGroupedDimensionColumnIds } from '../getGroupedDimensionColumnIds';
import {
    Th,
    ThActionsContainer,
    ThContainer,
    ThLabelContainer,
} from '../Table.styles';
import { useColumnResize } from '../useColumnResize';
import { useTableContext } from '../useTableContext';
import { HeaderDnD } from './HeaderDnD';
import classes from './HeaderDnD.module.css';

interface TableHeaderProps {
    minimal?: boolean;
    showSubtotals?: boolean;
}

/**
 * Walkthrough result for manage:CustomSqlTableCalculations: the new column's
 * header in the results table (absent until a calculation exists).
 */
const tableCalculationTourProps = {
    'data-tour-anchor': 'table-calculation-column',
    'data-tour-scope': 'manage:CustomSqlTableCalculations',
    'data-tour-step': '1',
    'data-tour-route': '/projects/:projectUuid/saved/:savedQueryUuid/edit',
    'data-tour-label': 'The calculation is a new column',
    'data-tour-docs':
        'explore/table-calculations.mdx#when-to-use-table-calculations:3',
    'data-tour-return': 'none',
    'data-tour-resultdocs': 'explore/table-calculations.mdx#intro:1',
};

const TableHeader: FC<TableHeaderProps> = ({
    minimal = false,
    showSubtotals = true,
}) => {
    const { table, headerContextMenu, columns, onColumnWidthChange } =
        useTableContext();
    const HeaderContextMenu = headerContextMenu;
    const { handleResizeStart, resizeHandleClassName } = useColumnResize({
        onColumnWidthChange,
    });

    useEffect(() => {
        if (showSubtotals) {
            const sortedColumns = getGroupedDimensionColumnIds(
                columns,
                table.getState().columnOrder,
            );

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
                <HeaderDnD key={headerGroup.id} headerGroup={headerGroup}>
                    {headerGroup.headers.map((header) => {
                        const meta = header.column.columnDef.meta;
                        const titleLabel =
                            meta?.labelOverride?.trim() ||
                            (isField(meta?.item) && meta.item.label
                                ? meta.item.label
                                : undefined);
                        const tooltipDescription =
                            meta?.item && isField(meta.item)
                                ? meta.item.description
                                : undefined;
                        const tooltipContext = meta?.headerContext;
                        const tooltipDetails = [
                            tooltipContext,
                            tooltipDescription,
                        ].filter((detail): detail is string => !!detail);
                        const tooltipLabel =
                            titleLabel && tooltipDetails.length > 0 ? (
                                <>
                                    {titleLabel}
                                    {tooltipDetails.map((detail) => (
                                        <React.Fragment key={detail}>
                                            <br />
                                            {detail}
                                        </React.Fragment>
                                    ))}
                                </>
                            ) : (
                                (titleLabel ?? tooltipDetails[0])
                            );
                        const isDragDisabled = minimal || !meta?.draggable;
                        const canResize =
                            onColumnWidthChange &&
                            !minimal &&
                            header.id !== ROW_NUMBER_COLUMN_ID &&
                            !meta?.isReadOnly;

                        return (
                            <Th
                                key={header.id}
                                colSpan={header.colSpan}
                                {...meta?.styleProps}
                                w={meta?.width}
                                bg={meta?.bgColor ?? 'ldGray.0'}
                                className={meta?.className}
                                {...(meta?.item && isTableCalculation(meta.item)
                                    ? tableCalculationTourProps
                                    : {})}
                            >
                                <SortableItem
                                    id={header.id}
                                    disabled={isDragDisabled}
                                >
                                    {(sortable) => (
                                        <ThContainer>
                                            {/* No sortable transform: columns reorder live in the table while dragging */}
                                            <ThLabelContainer
                                                {...(!isDragDisabled &&
                                                    sortable.handleProps)}
                                                ref={(el) => {
                                                    sortable.ref(el);
                                                    sortable.handleProps.ref(
                                                        el,
                                                    );
                                                }}
                                                className={
                                                    isDragDisabled
                                                        ? undefined
                                                        : classes.handle
                                                }
                                            >
                                                <Tooltip
                                                    openDelay={500}
                                                    maw={400}
                                                    label={tooltipLabel}
                                                    position="top"
                                                    disabled={
                                                        !tooltipLabel ||
                                                        minimal ||
                                                        sortable.isDragging
                                                    }
                                                >
                                                    <span>
                                                        {header.isPlaceholder
                                                            ? null
                                                            : flexRender(
                                                                  header.column
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
                                </SortableItem>
                                {canResize && (
                                    <div
                                        className={resizeHandleClassName}
                                        role="separator"
                                        aria-orientation="vertical"
                                        onMouseDown={(e) =>
                                            handleResizeStart(e, header.id)
                                        }
                                    />
                                )}
                            </Th>
                        );
                    })}
                </HeaderDnD>
            ))}
        </thead>
    );
};

export default TableHeader;
