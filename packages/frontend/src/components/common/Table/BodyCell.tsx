import { Position } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { FC } from 'react';
import { CSSProperties } from 'styled-components';
import RichBodyCell from './ScrollableTable/RichBodyCell';
import { Td } from './Table.styles';
import { CellContextMenuProps } from './types';

interface CommonBodyCellProps {
    cell: Cell<ResultRow, unknown>;
    rowIndex: number;
    isNumericItem: boolean;
    hasData: boolean;
    cellContextMenu?: FC<CellContextMenuProps>;
    className?: string;
    style?: CSSProperties;
    backgroundColor?: string;
    copying?: boolean;
    selected?: boolean;
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
    copying = false,
    hasData,
    isNumericItem,
    rowIndex,
    selected = false,
    style,
    onSelect,
    onDeselect,
    onKeyDown,
}) => {
    const CellContextMenu = cellContextMenu;

    const hasContextMenu = hasData && !!CellContextMenu;

    const handleSelect = () => {
        if (!hasContextMenu) return;
        onSelect();
    };

    const handleDeselect = () => {
        onDeselect();
    };

    return (
        <Popover2
            isOpen={selected}
            lazy
            minimal
            position={Position.BOTTOM_RIGHT}
            hasBackdrop
            backdropProps={{ onClick: handleDeselect }}
            onOpening={() => handleSelect()}
            onClose={() => handleDeselect()}
            content={
                CellContextMenu && (
                    <CellContextMenu
                        cell={cell as Cell<ResultRow, ResultRow[0]>}
                    />
                )
            }
            renderTarget={({ ref }) => (
                <Td
                    className={className}
                    style={{
                        ...style,
                        ...(selected
                            ? { position: 'relative', zIndex: 21 }
                            : {}),
                        ...(backgroundColor
                            ? { backgroundColor: backgroundColor }
                            : {}),
                    }}
                    ref={ref}
                    onKeyDown={onKeyDown}
                    $rowIndex={rowIndex}
                    $isSelected={selected}
                    $isInteractive={hasContextMenu}
                    $isCopying={copying}
                    $hasData={hasContextMenu}
                    $isNaN={!hasData || !isNumericItem}
                    onClick={selected ? handleDeselect : handleSelect}
                >
                    <RichBodyCell cell={cell as Cell<ResultRow, ResultRow[0]>}>
                        {children}
                    </RichBodyCell>
                </Td>
            )}
        />
    );
};

export default BodyCell;
