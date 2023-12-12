import { ResultRow } from '@lightdash/common';
import { Portal, Tooltip, TooltipProps } from '@mantine/core';
import { useHover } from '@mantine/hooks';
import { Cell } from '@tanstack/react-table';
import { FC, useCallback } from 'react';
import { CSSProperties } from 'styled-components';
import RichBodyCell from './ScrollableTable/RichBodyCell';
import { Td } from './Table.styles';
import { TableContext } from './TableProvider';
import { CellContextMenuProps } from './types';

interface CommonBodyCellProps {
    cell: Cell<ResultRow, unknown>;
    index: number;
    isNumericItem: boolean;
    hasData: boolean;
    hasContextMenu: boolean;
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
    onSelectCell?: TableContext['onSelectCell'];
    onDeselectCell?: TableContext['onDeselectCell'];
    onKeyDown: React.KeyboardEventHandler<HTMLElement>;
}

type CellTooltipProps = Omit<TooltipProps, 'children'> & {
    elementBounds: DOMRect;
};

const CellTooltip: FC<CellTooltipProps> = ({ elementBounds, ...rest }) => {
    return (
        <Portal>
            <Tooltip {...rest} opened>
                <div
                    style={{
                        zIndex: -1,
                        position: 'absolute',
                        left: elementBounds.x,
                        top: elementBounds.y,
                        width: elementBounds.width,
                        height: elementBounds.height,
                    }}
                />
            </Tooltip>
        </Portal>
    );
};

const BodyCell: FC<CommonBodyCellProps> = ({
    cell,
    children,
    className,
    backgroundColor,
    fontColor,
    copying = false,
    hasData,
    hasContextMenu,
    isNumericItem,
    index,
    selected = false,
    isLargeText = false,
    style,
    tooltipContent,
    minimal = false,
    onSelectCell,
    onDeselectCell,
    onKeyDown,
}) => {
    const { ref, hovered } = useHover<HTMLTableCellElement>();

    const handleSelect = useCallback(
        (e: React.MouseEvent<HTMLTableCellElement>) => {
            if (!onSelectCell || !hasContextMenu || !hasData) return;

            e.stopPropagation();
            e.preventDefault();

            const cellWithResultValue = cell as Cell<ResultRow, ResultRow[0]>;
            onSelectCell(cellWithResultValue, e.currentTarget);
        },
        [onSelectCell, hasContextMenu, hasData, cell],
    );

    const showTooltip = !!tooltipContent && hovered && !minimal && ref.current;

    return (
        <>
            {showTooltip ? (
                <CellTooltip
                    position="top"
                    label={tooltipContent}
                    elementBounds={ref.current?.getBoundingClientRect()}
                />
            ) : null}

            <Td
                ref={ref}
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
                onMouseDown={selected ? onDeselectCell : handleSelect}
                onKeyDown={onKeyDown}
            >
                <RichBodyCell cell={cell as Cell<ResultRow, ResultRow[0]>}>
                    {children}
                </RichBodyCell>
            </Td>
        </>
    );
};

export default BodyCell;
