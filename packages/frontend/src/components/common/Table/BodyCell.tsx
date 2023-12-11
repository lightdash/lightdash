import { ResultRow } from '@lightdash/common';
import { Button, Flex, Menu, Tooltip } from '@mantine/core';
import { Cell } from '@tanstack/react-table';
import { useContextMenu } from 'mantine-contextmenu';
import { FC, useCallback } from 'react';
import { CSSProperties } from 'styled-components';
import RichBodyCell from './ScrollableTable/RichBodyCell';
import { Td } from './Table.styles';
import { CellContextMenuProps } from './types';

interface CommonBodyCellProps {
    cell: Cell<ResultRow, unknown>;
    index: number;
    isNumericItem: boolean;
    hasData: boolean;
    cellContextMenu?: FC<CellContextMenuProps>;
    className?: string;
    style?: CSSProperties;
    backgroundColor?: string;
    fontColor?: string;
    copying?: boolean;
    selected?: boolean;
    isLargeText?: boolean;
    tooltipContent?: string;
    minimal?: boolean;
    onSelect: () => void;
    onDeselect: () => void;
    onKeyDown: React.KeyboardEventHandler<HTMLElement>;
}

const BodyCell: FC<CommonBodyCellProps> = ({
    cell,
    cellContextMenu,
    children,
    className,
    backgroundColor,
    fontColor,
    copying = false,
    hasData,
    isNumericItem,
    index,
    selected = false,
    isLargeText = false,
    style,
    tooltipContent,
    minimal = false,
    onSelect,
    onDeselect,
    onKeyDown,
}) => {
    const showContextMenu = useContextMenu();

    const CellContextMenu = cellContextMenu;

    const hasContextMenu = hasData && !!CellContextMenu;

    const handleSelect = useCallback(() => {
        if (!hasContextMenu) return;
        onSelect();
    }, [hasContextMenu, onSelect]);

    const handleDeselect = useCallback(() => {
        onDeselect();
    }, [onDeselect]);

    console.log(cellContextMenu);

    return (
        // <Menu
        //     withinPortal
        //     onContextMenu
        //     portalProps={{ target: className }}
        //     opened={selected}
        //     onOpen={() => handleSelect()}
        //     onClose={() => handleDeselect()}
        //     closeOnItemClick
        //     closeOnEscape
        //     shadow="md"
        //     position="bottom-end"
        //     radius={0}
        //     offset={{
        //         mainAxis: 0,
        //         crossAxis: 0,
        //     }}
        // >
        // {CellContextMenu && (
        //     <Menu.Dropdown>
        // <CellContextMenu
        //     cell={cell as Cell<ResultRow, ResultRow[0]>}
        // />
        //     </Menu.Dropdown>
        // )}

        // <Menu.Target>
        //     <Tooltip
        //         withinPortal
        //         portalProps={{ target: className }}
        //         position="top"
        //         disabled={!tooltipContent || minimal}
        //         label={tooltipContent}
        //     >
        <Td
            className={className}
            style={style}
            $rowIndex={index}
            $isSelected={selected}
            $isLargeText={isLargeText}
            $isMinimal={minimal}
            $isInteractive={hasContextMenu}
            $isCopying={copying}
            $backgroundColor={backgroundColor}
            $fontColor={fontColor}
            $hasData={hasContextMenu}
            $isNaN={!hasData || !isNumericItem}
            onClick={selected ? handleDeselect : handleSelect}
            onKeyDown={onKeyDown}
            onContextMenu={showContextMenu((close) =>
                CellContextMenu ? (
                    <CellContextMenu
                        cell={cell as Cell<ResultRow, ResultRow[0]>}
                    />
                ) : (
                    <></>
                ),
            )}
            // onContextMenu={showContextMenu((close) => CellContextMenu)}
        >
            <RichBodyCell cell={cell as Cell<ResultRow, ResultRow[0]>}>
                {children}
            </RichBodyCell>
        </Td>
        // </Tooltip>
        //     </Menu.Target>
        // </Menu>
    );
};

export default BodyCell;
