import { Box } from '@mantine/core';
import { useRef, type FC } from 'react';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../useTableContext';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';
import { useColumnWindow } from './useColumnWindow';

interface ScrollableTableProps {
    minimal?: boolean;
    showSubtotals?: boolean;
    showRowGrouping?: boolean;
    isDashboard?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({
    minimal = true,
    showSubtotals = true,
    showRowGrouping = false,
    isDashboard = false,
}) => {
    const { footer, table } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const columnWindow = useColumnWindow(
        table,
        tableContainerRef,
        isDashboard && !showRowGrouping && !showSubtotals,
    );

    return (
        <TableScrollableWrapper
            ref={tableContainerRef}
            $isDashboard={isDashboard}
        >
            <Table
                $showFooter={!!footer?.show}
                $virtualWidth={columnWindow?.width}
                aria-colcount={columnWindow?.headers.length}
            >
                {columnWindow && (
                    <colgroup>
                        {columnWindow.slots.map((slot) => (
                            <Box
                                component="col"
                                key={slot.key}
                                w={slot.width}
                            />
                        ))}
                    </colgroup>
                )}
                <TableHeader
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                    columnWindow={columnWindow}
                />
                <TableBody
                    tableContainerRef={tableContainerRef}
                    minimal={minimal}
                    showSubtotals={showSubtotals}
                    showRowGrouping={showRowGrouping}
                    columnWindow={columnWindow}
                />
                <TableFooter columnWindow={columnWindow} />
            </Table>
        </TableScrollableWrapper>
    );
};

export default ScrollableTable;
