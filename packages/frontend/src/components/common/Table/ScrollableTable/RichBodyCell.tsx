import { isField, type ResultRow } from '@lightdash/common';
import { type Cell } from '@tanstack/react-table';
import { type FC } from 'react';
import styled from 'styled-components';

interface RichBodyCellProps {
    cell: Cell<ResultRow, ResultRow[0]>;
}

const Link = styled.span`
    text-decoration: underline;
    text-decoration-style: dotted;
`;

const RichBodyCell: FC<React.PropsWithChildren<RichBodyCellProps>> = ({
    children,
    cell,
}) => {
    const item = cell.column.columnDef.meta?.item;
    const hasUrls = isField(item) && (item.urls || []).length > 0;

    if (hasUrls) {
        return <Link>{children}</Link>;
    } else {
        return <>{children}</>;
    }
};

export default RichBodyCell;
