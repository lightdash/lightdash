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
    hasContextMenu: boolean;
    cellContextMenu?: FC<CellContextMenuProps>;
}

interface BodyCellProps extends CommonBodyCellProps {
    isSelected: boolean;
    onClick?: (e: React.MouseEvent<HTMLTableCellElement>) => void;
}

const BodyCell = React.forwardRef<HTMLTableCellElement, BodyCellProps>(
    (
        {
            rowIndex,
            cell,
            hasContextMenu,
            hasData,
            isNumericItem,
            isSelected,
            children,
            onClick,
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
                onClick={isSelected ? undefined : onClick}
            >
                <RichBodyCell cell={cell as Cell<ResultRow, ResultRow[0]>}>
                    {children}
                </RichBodyCell>
            </Td>
        );
    },
);

interface BodyCellWrapperProps extends CommonBodyCellProps {
    onSelect: (cellId: string | undefined) => void;
}

const BodyCellWrapper: FC<BodyCellWrapperProps> = ({ onSelect, ...props }) => {
    const CellContextMenu = props.cellContextMenu;

    const [isCellSelected, setIsCellSelected] = useState<boolean>(false);

    const handleCellSelect = useCallback(
        (cellId: string | undefined) => {
            onSelect(cellId);
            setIsCellSelected(cellId ? true : false);
        },
        [onSelect, setIsCellSelected],
    );

    return CellContextMenu && isCellSelected ? (
        <CellContextMenu
            key={props.cell.id}
            cell={props.cell as Cell<ResultRow, ResultRow[0]>}
            onOpen={() => handleCellSelect(props.cell.id)}
            onClose={() => handleCellSelect(undefined)}
            renderCell={({ ref }) => (
                <BodyCell isSelected={true} ref={ref} {...props} />
            )}
        />
    ) : (
        <BodyCell
            {...props}
            isSelected={false}
            onClick={
                CellContextMenu
                    ? () => handleCellSelect(props.cell.id)
                    : undefined
            }
        />
    );
};

export default BodyCellWrapper;
