import { type ResultRow } from '@lightdash/common';
import { Menu, Portal, type MenuProps } from '@mantine/core';
import { type Cell } from '@tanstack/react-table';
import { type FC } from 'react';
import { usePreventScroll } from '../../../../hooks/useBlockScroll';
import { type CellContextMenuProps } from '../types';

type CellMenuProps = MenuProps & {
    menuItems: FC<React.PropsWithChildren<CellContextMenuProps>>;
    cell: Cell<ResultRow, ResultRow[0]>;
    elementBounds: DOMRect | null;
};

const CellMenu: FC<React.PropsWithChildren<CellMenuProps>> = ({
    cell,
    elementBounds,
    menuItems: MenuItems,
    ...rest
}) => {
    usePreventScroll();

    return (
        <Portal onClick={(e) => e.stopPropagation()}>
            <Menu
                opened
                closeOnItemClick
                closeOnClickOutside
                closeOnEscape
                shadow="md"
                position="bottom-end"
                radius={0}
                offset={{ mainAxis: 0, crossAxis: 0 }}
                {...rest}
            >
                <Menu.Dropdown>
                    <MenuItems cell={cell} />
                </Menu.Dropdown>

                <Menu.Target>
                    <div
                        style={{
                            pointerEvents: 'none',
                            position: 'absolute',
                            zIndex: -1,
                            left: elementBounds?.x ?? 0 + window.scrollX,
                            top: elementBounds?.y ?? 0 + window.scrollY,
                            width: elementBounds?.width ?? 0,
                            height: elementBounds?.height ?? 0,
                        }}
                    />
                </Menu.Target>
            </Menu>
        </Portal>
    );
};

export default CellMenu;
