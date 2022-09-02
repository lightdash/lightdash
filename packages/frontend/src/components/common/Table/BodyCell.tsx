import { Position } from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import React, { FC, useCallback, useState } from 'react';
import { createGlobalStyle } from 'styled-components';
import RichBodyCell from './ScrollableTable/RichBodyCell';
import { Td } from './Table.styles';
import { useTableContext } from './TableProvider';
import { CellContextMenuProps } from './types';

interface CommonBodyCellProps {
    cell: Cell<ResultRow, unknown>;
    rowIndex: number;
    isNumericItem: boolean;
    hasData: boolean;
    cellContextMenu?: FC<CellContextMenuProps>;
    onSelect?: (cellId: string | undefined) => void;
}

interface BodyCellProps extends CommonBodyCellProps {
    isSelected: boolean;
    hasContextMenu: boolean;
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
            children,
            onSelect,
        },
        ref,
    ) => {
        return (
            <Td
                ref={ref}
                $rowIndex={rowIndex}
                $isSelected={isSelected}
                $isInteractive={hasContextMenu}
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

const PopoverStyles = createGlobalStyle`
    .bp4-portal.bp4-popover-portal-results-table-cell-context-menu {
        .bp4-overlay-content {
            z-index: 18 !important; /* blueprint default is 20 */
        }
    }
`;

const BodyCellWrapper: FC<CommonBodyCellProps> = ({ onSelect, ...props }) => {
    const { scrollableWrapperRef } = useTableContext();

    const CellContextMenu = props.cellContextMenu;

    const [isCellSelected, setIsCellSelected] = useState<boolean>(false);

    const handleCellSelect = useCallback(
        (cellId: string | undefined) => {
            onSelect?.(cellId);
            setIsCellSelected(cellId ? true : false);
        },
        [onSelect, setIsCellSelected],
    );

    const canHaveContextMenu = !!CellContextMenu && props.hasData;

    return canHaveContextMenu && isCellSelected ? (
        <>
            <PopoverStyles />

            <Popover2
                minimal
                position={Position.BOTTOM_RIGHT}
                defaultIsOpen
                portalClassName="bp4-popover-portal-results-table-cell-context-menu"
                portalContainer={scrollableWrapperRef.current}
                content={
                    <CellContextMenu
                        cell={props.cell as Cell<ResultRow, ResultRow[0]>}
                    />
                }
                renderTarget={({ ref }) => (
                    <BodyCell
                        {...props}
                        hasContextMenu
                        isSelected={true}
                        onSelect={handleCellSelect}
                        ref={ref}
                    />
                )}
                onOpening={() => handleCellSelect(props.cell.id)}
                onClosing={() => handleCellSelect(undefined)}
            />
        </>
    ) : (
        <BodyCell
            {...props}
            isSelected={false}
            hasContextMenu={canHaveContextMenu}
            onSelect={CellContextMenu ? handleCellSelect : undefined}
        />
    );
};

export default BodyCellWrapper;
