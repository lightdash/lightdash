import {
    isField,
    isRawResultRow,
    isResultValue,
    type ConditionalFormattingTextStyle,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { clsx } from '@mantine/core';
import {
    getHotkeyHandler,
    useClipboard,
    useDisclosure,
    useTimeout,
} from '@mantine/hooks';
import { type Cell } from '@tanstack/react-table';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { type CSSProperties } from 'styled-components';
import useToaster from '../../../../hooks/toaster/useToaster';
import { JsonCellModal } from '../../JsonViewer/JsonCellViewer';
import { type JsonCellValue } from '../../JsonViewer/utils';
import { Td } from '../Table.styles';
import { type CellContextMenuProps } from '../types';
import bodyCellStyles from './BodyCell.module.css';
import CellMenu from './CellMenu';
import CellTooltip from './CellTooltip';

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
    textStyle?: ConditionalFormattingTextStyle;
    isLargeText?: boolean;
    tooltipContent?: string;
    minimal?: boolean;
    // Set on a row-grouping block-start cell that vertically merges >1 row.
    rowSpan?: number;
}

const BodyCell: FC<React.PropsWithChildren<CommonBodyCellProps>> = ({
    cell,
    children,
    className,
    backgroundColor,
    fontColor,
    textStyle,
    hasData,
    cellContextMenu,
    isNumericItem,
    index,
    isLargeText = false,
    style,
    tooltipContent,
    minimal = false,
    rowSpan,
}) => {
    const isMerged = !!rowSpan && rowSpan > 1;
    const elementRef = useRef<HTMLTableCellElement>(null);
    const { showToastSuccess } = useToaster();
    const { copy } = useClipboard();

    const [isCopying, setCopying] = useState(false);
    const [isMenuOpen, { toggle: toggleMenu }] = useDisclosure(false);
    const [jsonModalValue, setJsonModalValue] = useState<
        JsonCellValue | undefined
    >();
    const [isTooltipOpen, { open: openTooltip, close: closeTooltip }] =
        useDisclosure(false);
    const [elementBounds, setElementBounds] = useState<DOMRect | null>(null);

    const canHaveMenu = !!cellContextMenu && hasData;
    const canHaveTooltip = !!tooltipContent && !minimal;

    const { start: startTooltipTimer, clear: clearTooltipTimer } = useTimeout(
        openTooltip,
        500,
    );
    const item = cell.column.columnDef.meta?.item;
    const hasUrls = isField(item) && item.urls ? item.urls.length > 0 : false;

    const shouldRenderMenu = canHaveMenu && isMenuOpen && elementRef.current;
    const shouldRenderTooltip =
        canHaveTooltip &&
        isTooltipOpen &&
        elementRef.current &&
        !shouldRenderMenu;

    // Calculate bounds when menu/tooltip opens, not during every render
    useEffect(() => {
        if ((shouldRenderMenu || shouldRenderTooltip) && elementRef.current) {
            setElementBounds(elementRef.current.getBoundingClientRect());
        } else if (!isMenuOpen && !isTooltipOpen) {
            // Clear bounds when closed to free memory
            setElementBounds(null);
        }
    }, [shouldRenderMenu, shouldRenderTooltip, isMenuOpen, isTooltipOpen]);

    const displayValue = useMemo(() => {
        if (!hasData) return null;

        const cellValue = cell.getValue();

        if (isResultValue(cellValue)) {
            return cellValue.value.formatted;
        } else if (isRawResultRow(cellValue)) {
            return cellValue;
        } else {
            return null;
        }
    }, [hasData, cell]);

    const handleCopy = useCallback(() => {
        if (!isMenuOpen) return;

        copy(displayValue);
        showToastSuccess({ title: 'Copied to clipboard!' });

        setCopying((copyingState) => {
            if (!copyingState) {
                setTimeout(() => setCopying(false), 300);
            }
            return true;
        });
    }, [isMenuOpen, displayValue, copy, showToastSuccess]);

    useEffect(() => {
        const handleKeyDown = getHotkeyHandler([['mod+C', handleCopy]]);

        if (isMenuOpen) {
            document.body.addEventListener('keydown', handleKeyDown);
        }

        return () => {
            document.body.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMenuOpen, handleCopy]);

    return (
        <>
            <Td
                ref={elementRef}
                className={clsx(
                    className,
                    isMerged && bodyCellStyles.mergedDimCell,
                )}
                rowSpan={isMerged ? rowSpan : undefined}
                style={style}
                $rowIndex={index}
                $isSelected={isMenuOpen}
                $isLargeText={isLargeText}
                $isMinimal={minimal}
                $isInteractive={canHaveMenu || canHaveTooltip}
                $isCopying={isCopying}
                $backgroundColor={backgroundColor}
                $fontColor={fontColor}
                $textStyle={textStyle}
                $hasData={hasData}
                $isNaN={!hasData || !isNumericItem}
                $hasUrls={hasUrls}
                $hasNewlines={
                    typeof displayValue === 'string' &&
                    displayValue.includes('\n')
                }
                onClick={canHaveMenu ? toggleMenu : undefined}
                onMouseEnter={canHaveTooltip ? startTooltipTimer : undefined}
                onMouseLeave={
                    canHaveTooltip
                        ? () => {
                              clearTooltipTimer();
                              closeTooltip();
                          }
                        : undefined
                }
            >
                <span>{children}</span>
            </Td>

            {shouldRenderMenu ? (
                <CellMenu
                    cell={cell as Cell<ResultRow, ResultRow[0]>}
                    menuItems={cellContextMenu}
                    elementBounds={elementBounds}
                    onClose={toggleMenu}
                    onViewJsonCell={setJsonModalValue}
                />
            ) : null}

            {jsonModalValue ? (
                <JsonCellModal
                    value={jsonModalValue}
                    opened
                    onClose={() => setJsonModalValue(undefined)}
                />
            ) : null}

            {shouldRenderTooltip ? (
                <CellTooltip
                    position="top"
                    label={tooltipContent}
                    elementBounds={elementBounds}
                />
            ) : null}
        </>
    );
};

export default BodyCell;
