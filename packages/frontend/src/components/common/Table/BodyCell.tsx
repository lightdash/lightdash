import { HotkeyConfig, Position, useHotkeys } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import copy from 'copy-to-clipboard';
import { FC, useMemo, useState } from 'react';
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
    selected?: boolean;
    onSelect: () => void;
    onDeselect: () => void;
}

const BodyCell: FC<CommonBodyCellProps> = ({
    cell,
    cellContextMenu,
    children,
    className,
    hasData,
    isNumericItem,
    rowIndex,
    style,
    selected = false,
    onSelect,
    onDeselect,
}) => {
    const CellContextMenu = cellContextMenu;

    const [isCopying, setIsCopying] = useState<boolean>(false);

    const hasContextMenu = hasData && !!CellContextMenu;

    const hotkeys = useMemo<HotkeyConfig[]>(
        () => [
            {
                label: 'Select cell',
                combo: 'mod+c',
                // global: true,
                disabled: !selected || !hasData,
                // preventDefault: true,
                // stopPropagation: true,
                onKeyDown: () => {
                    const value = (cell.getValue() as ResultRow[0]).value
                        .formatted;

                    // setIsCopying(true);
                    // copy(value);
                    // setTimeout(() => setIsCopying(false), 150);
                },
            },
        ],
        [selected, hasData, cell],
    );

    // const { handleKeyDown: onKeyDown } = useHotkeys(hotkeys);

    // const handleKeyDown = useCallback(
    //     (event: React.KeyboardEvent) => {
    //         if (!isSelected) return undefined;

    //         onKeyDown(event as any);
    //     },
    //     [isSelected, onKeyDown],
    // );

    return (
        <Popover2
            isOpen={selected}
            lazy
            minimal
            position={Position.BOTTOM_RIGHT}
            hasBackdrop
            backdropProps={{ onClick: onDeselect }}
            onOpening={() => onSelect()}
            onClose={() => onDeselect()}
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
                    }}
                    ref={ref}
                    // onKeyDown={handleKeyDown}
                    $rowIndex={rowIndex}
                    $isSelected={selected}
                    $isInteractive={hasContextMenu}
                    $isCopying={isCopying}
                    $hasData={hasContextMenu}
                    $isNaN={!hasData || !isNumericItem}
                    onClick={selected ? onDeselect : onSelect}
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
