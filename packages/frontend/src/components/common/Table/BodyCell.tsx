import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import React, { FC } from 'react';
import RichBodyCell from './ScrollableTable/RichBodyCell';
import { Td } from './Table.styles';
import { CellContextMenuProps } from './types';

interface CommonBodyCellProps {
    cell: Cell<ResultRow, unknown>;
    rowIndex: number;
    isNumericItem: boolean;
    isSelected: boolean;
    hasData: boolean;
    hasContextMenu: boolean;
    cellContextMenu?: FC<CellContextMenuProps>;
}

interface BodyCellProps extends CommonBodyCellProps {
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
                onClick={onClick}
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

const BodyCellWrapper: FC<BodyCellWrapperProps> = (props) => {
    const CellContextMenu = props.cellContextMenu;

    return CellContextMenu && props.isSelected ? (
        <CellContextMenu
            key={props.cell.id}
            cell={props.cell as Cell<ResultRow, ResultRow[0]>}
            onOpen={() => props.onSelect(props.cell.id)}
            onClose={() => props.onSelect(undefined)}
            renderCell={({ ref }) => <BodyCell ref={ref} {...props} />}
        />
    ) : (
        <BodyCell {...props} onClick={() => props.onSelect(props.cell.id)} />
    );
};

export default BodyCellWrapper;
