import { ResultRow } from '@lightdash/common';
import { Menu, MenuProps, Portal } from '@mantine/core';
import { Cell } from '@tanstack/react-table';
import { FC } from 'react';
import { usePreventScroll } from '../../../../hooks/useBlockScroll';
import { CellContextMenuProps } from '../types';

type CellMenuProps = MenuProps & {
    menuItems: FC<React.PropsWithChildren<CellContextMenuProps>>;
    cell: Cell<ResultRow, ResultRow[0]>;
    elementBounds: DOMRect;
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
                            left: elementBounds.x,
                            top: elementBounds.y,
                            width: elementBounds.width,
                            height: elementBounds.height,
                        }}
                    />
                </Menu.Target>
            </Menu>
        </Portal>
    );
};

export default CellMenu;
