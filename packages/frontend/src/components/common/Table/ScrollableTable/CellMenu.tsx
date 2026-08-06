import { Menu, Portal, type MenuProps } from '@mantine/core';
import { type FC } from 'react';
import { usePreventScroll } from '../../../../hooks/useBlockScroll';

type CellMenuProps = MenuProps & {
    elementBounds: DOMRect | null;
};

/**
 * Dropdown anchored to a cell's measured bounds. The target is an invisible box
 * placed over the cell, so the menu positions itself without the cell having to
 * be a Mantine Menu.Target.
 */
const CellMenu: FC<React.PropsWithChildren<CellMenuProps>> = ({
    elementBounds,
    children,
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
                <Menu.Dropdown>{children}</Menu.Dropdown>

                <Menu.Target>
                    <div
                        style={{
                            pointerEvents: 'none',
                            position: 'absolute',
                            zIndex: -1,
                            left: (elementBounds?.x ?? 0) + window.scrollX,
                            top: (elementBounds?.y ?? 0) + window.scrollY,
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
