import {
    isField,
    isRawResultRow,
    isResultValue,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
import { getHotkeyHandler, useClipboard } from '@mantine/hooks';
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
import { Td } from '../Table.styles';
import { type CellContextMenuProps } from '../types';
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
    isLargeText?: boolean;
    tooltipContent?: string;
    minimal?: boolean;
}

/**
 * Expensive interactive hooks (clipboard, hotkeys, toaster) that only
 * mount when a cell's context menu is open. Only ONE cell at a time.
 */
const ActiveCellInteractions: FC<{
    displayValue: unknown;
    onCopyingChange: (copying: boolean) => void;
}> = ({ displayValue, onCopyingChange }) => {
    const { showToastSuccess } = useToaster();
    const { copy } = useClipboard();

    const handleCopy = useCallback(() => {
        copy(displayValue);
        showToastSuccess({ title: 'Copied to clipboard!' });
        onCopyingChange(true);
        setTimeout(() => onCopyingChange(false), 300);
    }, [displayValue, copy, showToastSuccess, onCopyingChange]);

    useEffect(() => {
        const handleKeyDown = getHotkeyHandler([['mod+C', handleCopy]]);
        document.body.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleCopy]);

    return null;
};

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
}) => {
    const elementRef = useRef<HTMLTableCellElement>(null);

    const [isCopying, setCopying] = useState(false);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [elementBounds, setElementBounds] = useState<DOMRect | null>(null);

    // Tooltip state via refs — no re-render on hover, only when tooltip shows
    const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isTooltipOpen, setIsTooltipOpen] = useState(false);

    const canHaveMenu = !!cellContextMenu && hasData;
    const canHaveTooltip = !!tooltipContent && !minimal;

    const item = cell.column.columnDef.meta?.item;
    const hasUrls = isField(item) && item.urls ? item.urls.length > 0 : false;

    const shouldRenderMenu = canHaveMenu && isMenuOpen && elementRef.current;
    const shouldRenderTooltip =
        canHaveTooltip &&
        isTooltipOpen &&
        elementRef.current &&
        !shouldRenderMenu;

    // Calculate bounds when menu/tooltip opens
    useEffect(() => {
        if ((shouldRenderMenu || shouldRenderTooltip) && elementRef.current) {
            setElementBounds(elementRef.current.getBoundingClientRect());
        } else if (!isMenuOpen && !isTooltipOpen) {
            setElementBounds(null);
        }
    }, [shouldRenderMenu, shouldRenderTooltip, isMenuOpen, isTooltipOpen]);

    // Clean up tooltip timer on unmount
    useEffect(() => {
        return () => {
            if (tooltipTimerRef.current) {
                clearTimeout(tooltipTimerRef.current);
            }
        };
    }, []);

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

    const openMenu = useCallback(() => setIsMenuOpen(true), []);
    const closeMenu = useCallback(() => setIsMenuOpen(false), []);

    // Plain setTimeout for tooltip delay — no useTimeout hook needed.
    // Only creates a timer when the user actually hovers, not on mount.
    const handleMouseEnter = canHaveTooltip
        ? () => {
              tooltipTimerRef.current = setTimeout(() => {
                  setIsTooltipOpen(true);
              }, 500);
          }
        : undefined;

    const handleMouseLeave = canHaveTooltip
        ? () => {
              if (tooltipTimerRef.current) {
                  clearTimeout(tooltipTimerRef.current);
                  tooltipTimerRef.current = null;
              }
              setIsTooltipOpen(false);
          }
        : undefined;

    return (
        <>
            <Td
                ref={elementRef}
                className={className}
                style={style}
                $rowIndex={index}
                $isSelected={isMenuOpen}
                $isLargeText={isLargeText}
                $isMinimal={minimal}
                $isInteractive={canHaveMenu || canHaveTooltip}
                $isCopying={isCopying}
                $backgroundColor={backgroundColor}
                $fontColor={fontColor}
                $hasData={hasData}
                $isNaN={!hasData || !isNumericItem}
                $hasUrls={hasUrls}
                $hasNewlines={
                    typeof displayValue === 'string' &&
                    displayValue.includes('\n')
                }
                onClick={canHaveMenu ? openMenu : undefined}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <span>{children}</span>
            </Td>

            {shouldRenderMenu ? (
                <>
                    <ActiveCellInteractions
                        displayValue={displayValue}
                        onCopyingChange={setCopying}
                    />
                    <CellMenu
                        cell={cell as Cell<ResultRow, ResultRow[0]>}
                        menuItems={cellContextMenu}
                        elementBounds={elementBounds}
                        onClose={closeMenu}
                    />
                </>
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
