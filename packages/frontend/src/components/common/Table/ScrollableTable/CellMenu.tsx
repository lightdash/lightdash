import { type ResultRow } from '@lightdash/common';
import { Box, Menu, Portal, type MenuProps } from '@mantine/core';
import { type Cell } from '@tanstack/react-table';
import { type FC } from 'react';
import { usePreventScroll } from '../../../../hooks/useBlockScroll';
import { type JsonCellValue } from '../../JsonViewer/utils';
import { type CellContextMenuProps } from '../types';
import classes from './CellAnchor.module.css';

type CellMenuProps = MenuProps & {
    menuItems: FC<React.PropsWithChildren<CellContextMenuProps>>;
    cell: Cell<ResultRow, ResultRow[0]>;
    elementBounds: DOMRect | null;
    onViewJsonCell?: (value: JsonCellValue) => void;
};

const CellMenu: FC<React.PropsWithChildren<CellMenuProps>> = ({
    cell,
    elementBounds,
    menuItems: MenuItems,
    onViewJsonCell,
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
                position="bottom-end"
                offset={{ mainAxis: 0, crossAxis: 0 }}
                {...rest}
            >
                <Menu.Dropdown>
                    <MenuItems cell={cell} onViewJsonCell={onViewJsonCell} />
                </Menu.Dropdown>

                <Menu.Target>
                    <Box
                        className={classes.anchor}
                        style={{
                            '--anchor-left': `${(elementBounds?.x ?? 0) + window.scrollX}px`,
                            '--anchor-top': `${(elementBounds?.y ?? 0) + window.scrollY}px`,
                            '--anchor-width': `${elementBounds?.width ?? 0}px`,
                            '--anchor-height': `${elementBounds?.height ?? 0}px`,
                        }}
                    />
                </Menu.Target>
            </Menu>
        </Portal>
    );
};

export default CellMenu;
