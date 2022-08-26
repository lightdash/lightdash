import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import React, { FC, useCallback, useState } from 'react';
import RichBodyCell from './ScrollableTable/RichBodyCell';
import { Td } from './Table.styles';
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

const BodyCellWrapper: FC<CommonBodyCellProps> = ({ onSelect, ...props }) => {
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
        <CellContextMenu
            key={props.cell.id}
            cell={props.cell as Cell<ResultRow, ResultRow[0]>}
            onOpen={() => handleCellSelect(props.cell.id)}
            onClose={() => handleCellSelect(undefined)}
            renderCell={({ ref }) => (
                <BodyCell
                    {...props}
                    hasContextMenu
                    isSelected={true}
                    onSelect={handleCellSelect}
                    ref={ref}
                />
            )}
        />
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
