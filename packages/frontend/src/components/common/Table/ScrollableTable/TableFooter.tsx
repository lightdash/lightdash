import { isNumericItem } from '@lightdash/common';
import { flexRender } from '@tanstack/react-table';
import { FooterCell } from '../Table.styles';
import { renderColumnGroups, type ColumnWindow } from '../useColumnWindow';
import { useTableContext } from '../useTableContext';

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
                        {renderColumnGroups(
                            columnWindow,
                            footerGroup.headers,
                            (columnIndex, colSpan, firstColumnIndex) => {
                                const header = footerGroup.headers[columnIndex];
                                const meta = header.column.columnDef.meta;
                                return (
                                    <FooterCell
                                        {...meta?.styleProps}
                                        className={meta?.className}
                                        key={
                                            header.colSpan === 1
                                                ? header.id
                                                : `${header.id}-${firstColumnIndex}`
                                        }
                                        colSpan={colSpan}
                                        aria-colindex={
                                            columnWindow
                                                ? firstColumnIndex + 1
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
