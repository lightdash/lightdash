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

interface BodyCellProps extends CommonBodyCellProps {
    isCopying?: boolean;
    isSelected: boolean;
    hasContextMenu: boolean;
    onKeyDown?: (event: React.KeyboardEvent) => void;
}

const BodyCell = React.forwardRef<HTMLTableCellElement, BodyCellProps>(
    (
        {
            rowIndex,
            cell,
            hasData,
            hasContextMenu,
            isNumericItem,
            isSelected,
            isCopying = false,
            children,
            onSelect,
            onKeyDown,
            className,
            style,
        },
        ref,
    ) => {
        return (
            <Td
                style={style}
                className={className}
                ref={ref}
                onKeyDown={onKeyDown}
                $rowIndex={rowIndex}
                $isSelected={isSelected}
                $isInteractive={hasContextMenu}
                $isCopying={isCopying}
                $hasData={hasData}
                $isNaN={!hasData || !isNumericItem}
                onClick={() => onSelect?.(isSelected ? undefined : cell.id)}
            >
                <RichBodyCell cell={cell as Cell<ResultRow, ResultRow[0]>}>
                    {children}
                </RichBodyCell>
            </Td>
        );
    },
);

const BodyCellWrapper: FC<CommonBodyCellProps> = ({ onSelect, ...props }) => {
    const CellContextMenu = props.cellContextMenu;

    const [isCellSelected, setIsCellSelected] = useState<boolean>(false);
    const [isCellBeingCopied, setIsCellBeingCopied] = useState<boolean>(false);

    const canHaveContextMenu = !!CellContextMenu && props.hasData;

    const handleCellSelect = useCallback(
        (cellId: string | undefined) => {
            if (!canHaveContextMenu) return;

            onSelect?.(cellId);
            setIsCellSelected(cellId ? true : false);
        },
        [onSelect, setIsCellSelected, canHaveContextMenu],
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
                global: true,
                disabled: !isCellSelected || !props.hasData,
                preventDefault: true,
                stopPropagation: true,
                onKeyDown: () => {
                    const value = (props.cell.getValue() as ResultRow[0]).value
                        .formatted;

                    setIsCellBeingCopied(true);
                    copy(value);
                    setTimeout(() => setIsCellBeingCopied(false), 150);
                },
            },
        ],
        [isCellSelected, props.hasData, props.cell],
    );

    const { handleKeyDown } = useHotkeys(hotkeys);

    return (
        <Popover2
            isOpen={isCellSelected}
            lazy
            minimal
            position={Position.BOTTOM_RIGHT}
            hasBackdrop
            backdropProps={{
                onClick: () => handleDebouncedCellSelect(undefined),
            }}
            onOpening={() => handleDebouncedCellSelect(props.cell.id)}
            onClose={() => handleDebouncedCellSelect(undefined)}
            content={
                CellContextMenu && (
                    <CellContextMenu
                        cell={props.cell as Cell<ResultRow, ResultRow[0]>}
                    />
                )
            }
            renderTarget={({ ref }) => (
                <BodyCell
                    {...props}
                    ref={ref}
                    style={
                        isCellSelected
                            ? { position: 'relative', zIndex: 21 }
                            : undefined
                    }
                    hasContextMenu={canHaveContextMenu}
                    isSelected={isCellSelected}
                    isCopying={isCellBeingCopied}
                    onSelect={handleDebouncedCellSelect}
                    onKeyDown={
                        isCellSelected
                            ? (e) => handleKeyDown(e as any)
                            : undefined
                    }
                />
            )}
        />
    );
};

export default BodyCellWrapper;
