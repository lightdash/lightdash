import {
    getCellUrls,
    isField,
    isMetric,
    isRawResultRow,
    isResultValue,
    type ConditionalFormattingTextStyle,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { Box } from '@mantine/core';
import {
    getHotkeyHandler,
    useClipboard,
    useDisclosure,
    useTimeout,
} from '@mantine/hooks';
import { type Cell } from '@tanstack/react-table';
import { clsx } from 'clsx';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import useToaster from '../../../../hooks/toaster/useToaster';
import { JsonCellModal } from '../../JsonViewer/JsonCellViewer';
import { type JsonCellValue } from '../../JsonViewer/utils';
import { getMergedValueLineClamp } from '../../PivotTable/getRowSpanMerges';
import { ROW_HEIGHT_PX } from '../constants';
import { Td, type CellStyleProps } from '../Table.styles';
import { type CellContextMenuProps } from '../types';
import {
    useRegisterMountedCell,
    type RegisterCell,
} from '../useMountedCellSelection';
import bodyCellStyles from './BodyCell.module.css';
import CellMenu from './CellMenu';
import CellTooltip from './CellTooltip';

// A cell's padding is 8.5px. A merged cell has no bottom padding.
const MERGED_CELL_PADDING_Y_PX = 8.5;

interface CommonBodyCellProps {
    columnIndex?: number;
    cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>;
    index: number;
    isNumericItem: boolean;
    hasData: boolean;
    cellContextMenu?: FC<React.PropsWithChildren<CellContextMenuProps>>;
    className?: string;
    styleProps?: CellStyleProps;
    backgroundColor?: string;
    fontColor?: string;
    textStyle?: ConditionalFormattingTextStyle;
    isLargeText?: boolean;
    tooltipContent?: string;
    minimal?: boolean;
    // Set on a row-grouping block-start cell that vertically merges >1 row.
    rowSpan?: number;
    // Set on a cell of a row-grouping block of more than one row, also when the
    // rendered rows clip the cell to one row.
    isMergedBlock?: boolean;
    // Lets the parent own the menu state, so it outlives a remount of the cell.
    isMenuOpen?: boolean;
    onToggleMenu?: () => void;
    // The cell registers its menu key while it is mounted, so the parent can
    // close a menu whose cell is gone.
    menuKey?: string;
    registerMenuCell?: RegisterCell;
}

const BodyCell: FC<React.PropsWithChildren<CommonBodyCellProps>> = ({
    columnIndex,
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
    styleProps,
    tooltipContent,
    minimal = false,
    rowSpan,
    isMergedBlock = false,
    isMenuOpen: isMenuOpenProp,
    onToggleMenu,
    menuKey,
    registerMenuCell,
}) => {
    useRegisterMountedCell(registerMenuCell, menuKey);
    const isMerged = !!rowSpan && rowSpan > 1;
    const elementRef = useRef<HTMLTableCellElement>(null);
    const { showToastSuccess } = useToaster();
    const { copy } = useClipboard();

    const [isCopying, setCopying] = useState(false);
    const [isOwnMenuOpen, { toggle: toggleOwnMenu }] = useDisclosure(false);
    const isMenuOpen = isMenuOpenProp ?? isOwnMenuOpen;
    const toggleMenu = onToggleMenu ?? toggleOwnMenu;
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
    const { start: startCopyingTimer } = useTimeout(
        () => setCopying(false),
        300,
    );
    const item = cell.column.columnDef.meta?.item;

    const isMenuShown = canHaveMenu && isMenuOpen;
    const isTooltipShown = canHaveTooltip && isTooltipOpen && !isMenuShown;

    // Calculate bounds when menu/tooltip opens, not during every render. A cell
    // can mount with its menu already open, so this runs after mount too.
    useEffect(() => {
        if ((isMenuShown || isTooltipShown) && elementRef.current) {
            setElementBounds(elementRef.current.getBoundingClientRect());
        } else if (!isMenuOpen && !isTooltipOpen) {
            // Clear bounds when closed to free memory
            setElementBounds(null);
        }
    }, [isMenuShown, isTooltipShown, isMenuOpen, isTooltipOpen]);

    const shouldRenderMenu = isMenuShown && elementBounds !== null;
    const shouldRenderTooltip = isTooltipShown && elementBounds !== null;

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

    const hasUrls = useMemo(() => {
        if (!canHaveMenu) return false;
        const cellValue = cell.getValue();
        const rawValue = isResultValue(cellValue)
            ? cellValue.value.raw
            : cellValue;
        return (
            getCellUrls(isField(item) ? item.urls : undefined, rawValue)
                .length > 0
        );
    }, [canHaveMenu, cell, item]);

    const handleCopy = useCallback(() => {
        if (!isMenuOpen) return;

        copy(displayValue);
        showToastSuccess({ title: 'Copied to clipboard!' });

        setCopying(true);
        startCopyingTimer();
    }, [isMenuOpen, displayValue, copy, showToastSuccess, startCopyingTimer]);

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
                aria-colindex={columnIndex}
                ref={elementRef}
                className={clsx(
                    className,
                    isMerged && bodyCellStyles.mergedDimCell,
                )}
                rowSpan={isMerged ? rowSpan : undefined}
                {...styleProps}
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
                // Walkthrough anchor (data-tour-via): a metric cell, whose
                // menu can open the records behind the number. The name is
                // computed, so the hint is declared here:
                //   data-tour-anchor="results-metric-cell" data-tour-hint="Click a number in the results"
                data-tour-anchor={
                    canHaveMenu && isField(item) && isMetric(item)
                        ? 'results-metric-cell'
                        : undefined
                }
                data-tour-hint="Click a number in the results"
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
                {isMergedBlock ? (
                    <Box
                        component="span"
                        className={bodyCellStyles.mergedDimValue}
                        __vars={{
                            '--merged-line-clamp': String(
                                getMergedValueLineClamp(
                                    rowSpan ?? 1,
                                    ROW_HEIGHT_PX,
                                    MERGED_CELL_PADDING_Y_PX,
                                ),
                            ),
                        }}
                    >
                        {children}
                    </Box>
                ) : (
                    <span>{children}</span>
                )}
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
