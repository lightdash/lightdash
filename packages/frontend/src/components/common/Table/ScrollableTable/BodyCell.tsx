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
 * Interactive behavior that only mounts on the selected (clicked) cell.
 * Handles clipboard copy, hotkeys, and context menu —
 * avoiding 1000+ timer/listener instances on initial table render.
 */
const ActiveBodyCellBehavior: FC<{
    cell: Cell<ResultRow, unknown> | Cell<RawResultRow, unknown>;
    displayValue: unknown;
    cellContextMenu?: FC<React.PropsWithChildren<CellContextMenuProps>>;
    elementRef: React.RefObject<HTMLTableCellElement | null>;
    onClose: () => void;
}> = ({ cell, displayValue, cellContextMenu, elementRef, onClose }) => {
    const { showToastSuccess } = useToaster();
    const { copy } = useClipboard();
    const [isCopying, setCopying] = useState(false);
    const [elementBounds, setElementBounds] = useState<DOMRect | null>(null);

    useEffect(() => {
        if (elementRef.current) {
            setElementBounds(elementRef.current.getBoundingClientRect());
        }
    }, [elementRef]);

    const handleCopy = useCallback(() => {
        copy(displayValue);
        showToastSuccess({ title: 'Copied to clipboard!' });
        setCopying(true);
        setTimeout(() => setCopying(false), 300);
    }, [displayValue, copy, showToastSuccess]);

    useEffect(() => {
        const handleKeyDown = getHotkeyHandler([['mod+C', handleCopy]]);
        document.body.addEventListener('keydown', handleKeyDown);
        return () => {
            document.body.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleCopy]);

    // Apply copying style to the cell element directly
    useEffect(() => {
        const el = elementRef.current;
        if (!el) return;
        if (isCopying) {
            el.setAttribute('data-is-copying', 'true');
        }
        return () => {
            el?.removeAttribute('data-is-copying');
        };
    }, [isCopying, elementRef]);

    return (
        <>
            {cellContextMenu && elementRef.current ? (
                <CellMenu
                    cell={cell as Cell<ResultRow, ResultRow[0]>}
                    menuItems={cellContextMenu}
                    elementBounds={elementBounds}
                    onClose={onClose}
                />
            ) : null}
        </>
    );
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
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    // Tooltip only mounts its timer when the cell is actually hovered
    const [isHovered, setIsHovered] = useState(false);
    const [isTooltipVisible, setIsTooltipVisible] = useState(false);
    const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [elementBounds, setElementBounds] = useState<DOMRect | null>(null);

    const canHaveMenu = !!cellContextMenu && hasData;
    const canHaveTooltip = !!tooltipContent && !minimal;

    const item = cell.column.columnDef.meta?.item;
    const hasUrls = isField(item) && item.urls ? item.urls.length > 0 : false;

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

    const handleMouseEnter = canHaveTooltip
        ? () => {
              setIsHovered(true);
              tooltipTimerRef.current = setTimeout(() => {
                  if (elementRef.current) {
                      setElementBounds(
                          elementRef.current.getBoundingClientRect(),
                      );
                  }
                  setIsTooltipVisible(true);
              }, 500);
          }
        : undefined;

    const handleMouseLeave = canHaveTooltip
        ? () => {
              setIsHovered(false);
              if (tooltipTimerRef.current) {
                  clearTimeout(tooltipTimerRef.current);
                  tooltipTimerRef.current = null;
              }
              setIsTooltipVisible(false);
          }
        : undefined;

    // Clean up timer on unmount
    useEffect(() => {
        return () => {
            if (tooltipTimerRef.current) {
                clearTimeout(tooltipTimerRef.current);
            }
        };
    }, []);

    const showTooltip =
        canHaveTooltip &&
        isTooltipVisible &&
        isHovered &&
        !isMenuOpen &&
        elementRef.current;

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
                $isCopying={false}
                $backgroundColor={backgroundColor}
                $fontColor={fontColor}
                $hasData={hasData}
                $isNaN={!hasData || !isNumericItem}
                $hasUrls={hasUrls}
                $hasNewlines={
                    typeof displayValue === 'string' &&
                    displayValue.includes('\n')
                }
                onClick={
                    canHaveMenu
                        ? () => setIsMenuOpen((prev) => !prev)
                        : undefined
                }
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <span>{children}</span>
            </Td>

            {isMenuOpen ? (
                <ActiveBodyCellBehavior
                    cell={cell}
                    displayValue={displayValue}
                    cellContextMenu={cellContextMenu}
                    elementRef={elementRef}
                    onClose={() => setIsMenuOpen(false)}
                />
            ) : null}

            {showTooltip ? (
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
