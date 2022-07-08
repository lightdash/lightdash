import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React from 'react';
import { FooterCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import { TableColumn } from '../types';

const TableFooter = () => {
    const { table, data } = useTableContext();
    if (data.length <= 0) {
        return null;
    }
    return (
        <tfoot>
            {table.getFooterGroups().map((footerGroup) => (
                <tr key={footerGroup.id}>
                    {footerGroup.headers.map((header) => {
                        const meta = header.column.columnDef
                            .meta as TableColumn['meta'];
                        return (
                            <FooterCell
                                key={header.id}
                                colSpan={header.colSpan}
                                $isNaN={
                                    !meta?.item || !isNumericItem(meta.item)
                                }
                            >
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                          header.column.columnDef.footer,
                                          header.getContext(),
                                      )}
                            </FooterCell>
                        );
                    })}
                </tr>
            ))}
        </tfoot>
    );
};

export default TableFooter;
