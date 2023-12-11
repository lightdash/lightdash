import { Menu, Portal } from '@mantine/core';
import { usePreventScroll } from '../../../../hooks/useBlockScroll';
import { useTableContext } from '../TableProvider';

const TableMenu = () => {
    const selectedCell = useTableContext((context) => context.selectedCell);
    const menuPosition = useTableContext((context) => context.menuPosition);
    const cellContextMenu = useTableContext(
        (context) => context.cellContextMenu,
    );
    const onDeselectCell = useTableContext((context) => context.onDeselectCell);

    const CellContextMenu = cellContextMenu;

    usePreventScroll(!!selectedCell);

    if (!CellContextMenu || !selectedCell || !menuPosition) return null;

    return (
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
    );
};

export default TableMenu;
