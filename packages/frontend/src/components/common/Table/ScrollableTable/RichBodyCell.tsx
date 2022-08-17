import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { FC } from 'react';
import styled from 'styled-components';

interface RichBodyCellProps {
    cell: Cell<ResultRow>;
}

const Link = styled.a`
    :hover {
        text-decoration: none;
    }
`;

const RichBodyCell: FC<RichBodyCellProps> = ({ children, cell }) => {
    const rawValue = cell.getValue()?.value?.raw;

    if (
        rawValue &&
        typeof rawValue === 'string' &&
        (rawValue.startsWith('http://') || rawValue.startsWith('https://'))
    ) {
        return <Link>{children}</Link>;
    } else {
        return <>{children}</>;
    }
};

export default RichBodyCell;
