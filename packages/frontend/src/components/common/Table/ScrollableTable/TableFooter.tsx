import { Colors } from '@blueprintjs/core';
import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React from 'react';
import { HeaderCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const TableFooter = () => {
    const { table } = useTableContext();
    return (
        <tfoot>
            {table.getFooterGroups().map((footerGroup) => (
                <tr key={footerGroup.id}>
                    {footerGroup.headers.map((header) => {
                        const meta = header.column.columnDef
                            .meta as TableColumn['meta'];
                        return (
                            <HeaderCell
                                key={header.id}
                                colSpan={header.colSpan}
                                style={{
                                    backgroundColor: Colors.WHITE,
                                }}
                                isNaN={!meta?.item || !isNumericItem(meta.item)}
                            >
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                          header.column.columnDef.footer,
                                          header.getContext(),
                                      )}
                            </HeaderCell>
                        );
                    })}
                </tr>
            ))}
        </tfoot>
    );
};

export default TableFooter;
