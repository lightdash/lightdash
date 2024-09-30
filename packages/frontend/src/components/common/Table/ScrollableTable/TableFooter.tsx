import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import React from 'react';
import { FooterCell } from '../Table.styles';
import { useTableContext } from '../TableProvider';

const TableFooter = () => {
    const { table, data, footer } = useTableContext();
    if (!footer?.show || data.length <= 0) {
        return null;
    }
    return (
        <tfoot>
            {table.getFooterGroups().map((footerGroup, index) => {
                // ignore header groups that are not totals
                if (index === 1) {
                    return null;
                }
                return (
                    <tr key={footerGroup.id}>
                        {footerGroup.headers.map((header) => {
                            const meta = header.column.columnDef.meta;
                            return (
                                <FooterCell
                                    style={meta?.style}
                                    className={meta?.className}
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
                );
            })}
        </tfoot>
    );
};

export default TableFooter;
