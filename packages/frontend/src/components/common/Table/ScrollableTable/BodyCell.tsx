import { type RawResultRow, type ResultRow } from '@lightdash/common';
import { getHotkeyHandler, useClipboard, useDisclosure } from '@mantine/hooks';
import { type Cell } from '@tanstack/react-table';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { type CSSProperties } from 'styled-components';
import useToaster from '../../../../hooks/toaster/useToaster';
import { Td } from '../Table.styles';
import { type CellContextMenuProps } from '../types';
import CellMenu from './CellMenu';
import CellTooltip from './CellTooltip';
import RichBodyCell from './RichBodyCell';

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

    const canHaveMenu = !!cellContextMenu && hasData;
    const canHaveTooltip = !!tooltipContent && !minimal;

    const shouldRenderMenu = canHaveMenu && isMenuOpen && elementRef.current;
    const shouldRenderTooltip =
        canHaveTooltip &&
        isTooltipOpen &&
        elementRef.current &&
        !shouldRenderMenu;

    const handleCopy = useCallback(() => {
        if (!isMenuOpen) return;

        const value = (cell as Cell<ResultRow, ResultRow[0]>).getValue().value
            .formatted;

        copy(value);
        showToastSuccess({ title: 'Copied to clipboard!' });

        setCopying((copyingState) => {
            if (!copyingState) {
                setTimeout(() => setCopying(false), 300);
            }
            return true;
        });
    }, [isMenuOpen, cell, copy, showToastSuccess]);

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
                onClick={canHaveMenu ? toggleMenu : undefined}
                onMouseEnter={canHaveTooltip ? openTooltip : undefined}
                onMouseLeave={canHaveTooltip ? closeTooltip : undefined}
            >
                <RichBodyCell cell={cell as Cell<ResultRow, ResultRow[0]>}>
                    {children}
                </RichBodyCell>
            </Td>

            {shouldRenderMenu ? (
                <CellMenu
                    cell={cell as Cell<ResultRow, ResultRow[0]>}
                    menuItems={cellContextMenu}
                    elementBounds={elementRef.current.getBoundingClientRect()}
                    onClose={toggleMenu}
                />
            ) : null}

            {shouldRenderTooltip ? (
                <CellTooltip
                    position="top"
                    label={tooltipContent}
                    elementBounds={elementRef.current.getBoundingClientRect()}
                />
            ) : null}
        </>
    );
};

export default BodyCell;
