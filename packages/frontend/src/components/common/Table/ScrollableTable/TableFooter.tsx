import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FooterCell } from '../Table.styles';
import { useTableContext } from '../useTableContext';
import { renderColumns, type ColumnWindow } from './useColumnWindow';

const TableFooter = ({ columnWindow }: { columnWindow?: ColumnWindow }) => {
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
                        {renderColumns(
                            columnWindow,
                            footerGroup.headers.length,
                            (columnIndex) => {
                                const header = footerGroup.headers[columnIndex];
                                const meta = header.column.columnDef.meta;
                                return (
                                    <FooterCell
                                        {...meta?.styleProps}
                                        className={meta?.className}
                                        key={header.id}
                                        colSpan={header.colSpan}
                                        aria-colindex={
                                            columnWindow
                                                ? columnIndex + 1
                                                : undefined
                                        }
                                        $isNaN={
                                            !meta?.item ||
                                            !isNumericItem(meta.item) ||
                                            ('richText' in meta.item &&
                                                !!meta.item.richText)
                                        }
                                    >
                                        {header.isPlaceholder
                                            ? null
                                            : flexRender(
                                                  header.column.columnDef
                                                      .footer,
                                                  header.getContext(),
                                              )}
                                    </FooterCell>
                                );
                            },
                        )}
                    </tr>
                );
            })}
        </tfoot>
    );
};

export default TableFooter;
