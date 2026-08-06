import { getItemId, isNumericItem, type ResultRow } from '@lightdash/common';
import { useDisclosure } from '@mantine/hooks';
import { flexRender, type Header } from '@tanstack/react-table';
import { useEffect, useRef, useState, type FC } from 'react';
import { getGrandTotalFieldValues } from '../getTotalsFieldValues';
import { FooterCell } from '../Table.styles';
import { type TableContext } from '../types';
import { useTableContext } from '../useTableContext';
import CellMenu from './CellMenu';

type FooterCellContentProps = {
    header: Header<ResultRow, unknown>;
    totalsCellContextMenu?: TableContext['totalsCellContextMenu'];
};

const TableFooterCell: FC<FooterCellContentProps> = ({
    header,
    totalsCellContextMenu: TotalsCellContextMenuItems,
}) => {
    const elementRef = useRef<HTMLTableCellElement>(null);
    const [isMenuOpen, { toggle: toggleMenu }] = useDisclosure(false);
    const [elementBounds, setElementBounds] = useState<DOMRect | null>(null);

    const meta = header.column.columnDef.meta;
    const item = meta?.item;
    const totalValue = meta?.totalValue;
    const canHaveMenu =
        !!TotalsCellContextMenuItems && !!item && totalValue !== undefined;
    const shouldRenderMenu = canHaveMenu && isMenuOpen && elementRef.current;

    useEffect(() => {
        if (shouldRenderMenu && elementRef.current) {
            setElementBounds(elementRef.current.getBoundingClientRect());
        } else if (!isMenuOpen) {
            setElementBounds(null);
        }
    }, [shouldRenderMenu, isMenuOpen]);

    return (
        <>
            <FooterCell
                ref={elementRef}
                style={meta?.style}
                className={meta?.className}
                colSpan={header.colSpan}
                $isInteractive={canHaveMenu}
                $isSelected={canHaveMenu && isMenuOpen}
                onClick={canHaveMenu ? toggleMenu : undefined}
                $isNaN={
                    !item ||
                    !isNumericItem(item) ||
                    ('richText' in item && !!item.richText)
                }
            >
                {header.isPlaceholder
                    ? null
                    : flexRender(
                          header.column.columnDef.footer,
                          header.getContext(),
                      )}
            </FooterCell>

            {shouldRenderMenu ? (
                <CellMenu elementBounds={elementBounds} onClose={toggleMenu}>
                    <TotalsCellContextMenuItems
                        totals={{
                            item,
                            value: totalValue,
                            fieldValues: getGrandTotalFieldValues(
                                getItemId(item),
                                totalValue,
                            ),
                        }}
                    />
                </CellMenu>
            ) : null}
        </>
    );
};

const TableFooter = () => {
    const { table, data, footer, totalsCellContextMenu } = useTableContext();
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
                        {footerGroup.headers.map((header) => (
                            <TableFooterCell
                                key={header.id}
                                header={header}
                                totalsCellContextMenu={totalsCellContextMenu}
                            />
                        ))}
                    </tr>
                );
            })}
        </tfoot>
    );
};

export default TableFooter;
