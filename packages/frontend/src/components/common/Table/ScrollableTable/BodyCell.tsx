import { ResultRow } from '@lightdash/common';
import { getHotkeyHandler, useDisclosure } from '@mantine/hooks';
import { Cell } from '@tanstack/react-table';
import copy from 'copy-to-clipboard';
import { FC, useCallback, useEffect, useRef, useState } from 'react';
import { CSSProperties } from 'styled-components';
import useToaster from '../../../../hooks/toaster/useToaster';
import { Td } from '../Table.styles';
import { CellContextMenuProps } from '../types';
import CellMenu from './CellMenu';
import CellTooltip from './CellTooltip';
import RichBodyCell from './RichBodyCell';

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
    isLargeText?: boolean;
    tooltipContent?: string;
    minimal?: boolean;
}

const BodyCell: FC<CommonBodyCellProps> = ({
    cell,
    children,
    className,
    backgroundColor,
    fontColor,
    hasData,
    hasContextMenu,
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

    const [isCopying, setCopying] = useState(false);
    const [isMenuOpen, { toggle: toggleMenu }] = useDisclosure(false);
    const [isTooltipOpen, { open: openTooltip, close: closeTooltip }] =
        useDisclosure(false);

    const shouldRenderMenu =
        isMenuOpen &&
        hasContextMenu &&
        cellContextMenu &&
        hasData &&
        !minimal &&
        elementRef.current;

    const shouldRenderTooltip =
        !shouldRenderMenu &&
        isTooltipOpen &&
        !!tooltipContent &&
        !minimal &&
        elementRef.current;

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
    }, [cell, isMenuOpen, showToastSuccess]);

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
                $isInteractive={hasContextMenu}
                $isCopying={isCopying}
                $backgroundColor={backgroundColor}
                $fontColor={fontColor}
                $hasData={hasContextMenu}
                $isNaN={!hasData || !isNumericItem}
                onClick={toggleMenu}
                onMouseEnter={openTooltip}
                onMouseLeave={closeTooltip}
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
