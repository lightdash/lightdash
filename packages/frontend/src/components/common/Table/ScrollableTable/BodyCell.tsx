import {
    isField,
    isRawResultRow,
    isResultValue,
    type RawResultRow,
    type ResultRow,
} from '@lightdash/common';
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
    const { showToastSuccess } = useToaster();
    const { copy } = useClipboard();

    const [isCopying, setCopying] = useState(false);
    const [isMenuOpen, { toggle: toggleMenu }] = useDisclosure(false);
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
