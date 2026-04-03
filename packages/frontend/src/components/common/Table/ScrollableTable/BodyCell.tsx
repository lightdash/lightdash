import {
    isField,
    isRawResultRow,
    isResultValue,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { type Cell } from '@tanstack/react-table';
import { useMemo, type FC } from 'react';
import { type CSSProperties } from 'styled-components';
import { Td } from '../Table.styles';
import { type CellContextMenuProps } from '../types';

interface CommonBodyCellProps {
    cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>;
    index: number;
    isNumericItem: boolean;
    hasData: boolean;
    cellContextMenu?: FC<React.PropsWithChildren<CellContextMenuProps>>;
    className?: string;
    style?: CSSProperties;
    backgroundColor?: string;
    fontColor?: string;
    isLargeText?: boolean;
    tooltipContent?: string;
    minimal?: boolean;
    isSelected?: boolean;
    onMenuToggle?: (
        cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>,
        elementBounds: DOMRect,
        displayValue: string | RawResultRow | null,
    ) => void;
    onTooltipShow?: (
        cellId: string,
        label: string,
        elementBounds: DOMRect,
    ) => void;
    onTooltipHide?: (cellId: string) => void;
}

const BodyCell: FC<React.PropsWithChildren<CommonBodyCellProps>> = ({
    cell,
    children,
    className,
    backgroundColor,
    fontColor,
    hasData,
    cellContextMenu,
    isNumericItem,
    index,
    isLargeText = false,
    style,
    tooltipContent,
    minimal = false,
    isSelected = false,
    onMenuToggle,
    onTooltipShow,
    onTooltipHide,
}) => {
    const canHaveMenu = !!cellContextMenu && hasData;
    const canHaveTooltip = !!tooltipContent && !minimal;
    const item = cell.column.columnDef.meta?.item;
    const hasUrls = isField(item) && item.urls ? item.urls.length > 0 : false;

    const displayValue = useMemo<string | RawResultRow | null>(() => {
        if (!hasData) return null;

        const cellValue = cell.getValue();

        if (isResultValue(cellValue)) {
            return cellValue.value.formatted;
        } else if (isRawResultRow(cellValue)) {
            return cellValue as RawResultRow;
        } else {
            return null;
        }
    }, [hasData, cell]);

    return (
        <Td
            className={className}
            style={style}
            $rowIndex={index}
            $isSelected={isSelected}
            $isLargeText={isLargeText}
            $isMinimal={minimal}
            $isInteractive={canHaveMenu || canHaveTooltip}
            $isCopying={false}
            $backgroundColor={backgroundColor}
            $fontColor={fontColor}
            $hasData={hasData}
            $isNaN={!hasData || !isNumericItem}
            $hasUrls={hasUrls}
            $hasNewlines={
                typeof displayValue === 'string' && displayValue.includes('\n')
            }
            onClick={
                canHaveMenu
                    ? (e) =>
                          onMenuToggle?.(
                              cell,
                              e.currentTarget.getBoundingClientRect(),
                              displayValue,
                          )
                    : undefined
            }
            onMouseEnter={
                canHaveTooltip
                    ? (e) =>
                          onTooltipShow?.(
                              cell.id,
                              tooltipContent,
                              e.currentTarget.getBoundingClientRect(),
                          )
                    : undefined
            }
            onMouseLeave={
                canHaveTooltip
                    ? () => {
                          onTooltipHide?.(cell.id);
                      }
                    : undefined
            }
        >
            <span>{children}</span>
        </Td>
    );
};

export default BodyCell;
