import { HotkeyConfig, Position, useHotkeys } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import copy from 'copy-to-clipboard';
import debounce from 'lodash/debounce';
import React, { FC, useCallback, useMemo, useState } from 'react';
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
    onSelect?: (cellId: string | undefined) => void;
    className?: string;
    style?: CSSProperties;
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
    onSelect,
}) => {
    const CellContextMenu = cellContextMenu;

    const [isSelected, setIsSelected] = useState<boolean>(false);
    const [isCopying, setIsCopying] = useState<boolean>(false);

    const hasContextMenu = hasData && !!CellContextMenu;

    const handleCellSelect = useCallback(
        (cellId: string | undefined) => {
            if (!hasContextMenu) return;

            onSelect?.(cellId);
            setIsSelected(cellId ? true : false);
        },
        [onSelect, setIsSelected, hasContextMenu],
    );

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const handleDebouncedCellSelect = useCallback(
        debounce(handleCellSelect, 300, {
            leading: true,
            trailing: false,
        }),
        [handleCellSelect],
    );

    const hotkeys = useMemo<HotkeyConfig[]>(
        () => [
            {
                label: 'Select cell',
                combo: 'mod+c',
                // global: true,
                disabled: !isSelected || !hasData,
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
        [isSelected, hasData, cell],
    );

    console.log(isSelected, hasData);

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
            isOpen={isSelected}
            lazy
            minimal
            position={Position.BOTTOM_RIGHT}
            hasBackdrop
            backdropProps={{
                onClick: () => handleDebouncedCellSelect(undefined),
            }}
            onOpening={() => handleDebouncedCellSelect(cell.id)}
            onClose={() => handleDebouncedCellSelect(undefined)}
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
                        ...(isSelected
                            ? { position: 'relative', zIndex: 21 }
                            : {}),
                    }}
                    ref={ref}
                    // onKeyDown={handleKeyDown}
                    $rowIndex={rowIndex}
                    $isSelected={isSelected}
                    $isInteractive={hasContextMenu}
                    $isCopying={isCopying}
                    $hasData={hasContextMenu}
                    $isNaN={!hasData || !isNumericItem}
                    onClick={() =>
                        handleDebouncedCellSelect(
                            isSelected ? undefined : cell.id,
                        )
                    }
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
