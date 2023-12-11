import { Menu, Portal } from '@mantine/core';
import { FC, useRef } from 'react';
import { usePreventScroll } from '../../../../hooks/useBlockScroll';
import { Table, TableScrollableWrapper } from '../Table.styles';
import { useTableContext } from '../TableProvider';
import TableBody from './TableBody';
import TableFooter from './TableFooter';
import TableHeader from './TableHeader';

interface ScrollableTableProps {
    minimal?: boolean;
}

const ScrollableTable: FC<ScrollableTableProps> = ({ minimal = true }) => {
    const {
        footer,
        menuPosition,
        selectedCell,
        onDeselectCell,
        cellContextMenu,
    } = useTableContext();
    const tableContainerRef = useRef<HTMLDivElement>(null);

    const CellContextMenu = cellContextMenu;

    usePreventScroll(!!selectedCell);

    return (
        <>
            <TableScrollableWrapper ref={tableContainerRef}>
                <Table $showFooter={!!footer?.show}>
                    <TableHeader minimal={minimal} />
                    <TableBody
                        tableContainerRef={tableContainerRef}
                        minimal={minimal}
                    />
                    <TableFooter />
                </Table>
            </TableScrollableWrapper>

            {CellContextMenu && selectedCell && menuPosition ? (
                <Portal>
                    <Menu
                        key={selectedCell.id}
                        defaultOpened
                        onClose={onDeselectCell}
                        closeOnItemClick
                        closeOnEscape
                        shadow="md"
                        position="bottom-end"
                        radius={0}
                        offset={{ mainAxis: 0, crossAxis: 0 }}
                    >
                        <Menu.Dropdown>
                            <CellContextMenu cell={selectedCell} />
                        </Menu.Dropdown>

                        <Menu.Target>
                            <div
                                style={{
                                    position: 'absolute',
                                    ...menuPosition,
                                }}
                            />
                        </Menu.Target>
                    </Menu>
                </Portal>
            ) : null}
        </>
    );
};

export default ScrollableTable;
