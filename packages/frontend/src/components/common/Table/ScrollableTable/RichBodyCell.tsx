import { ResultRow } from '@lightdash/common';
import { Cell } from '@tanstack/react-table';
import { FC } from 'react';
import styled from 'styled-components';

interface RichBodyCellProps {
    cell: Cell<ResultRow, ResultRow[0]>;
}

const Link = styled.a`
    :hover {
        text-decoration: none;
    }
`;

export const isUrl = (value: string) => {
    return (
        value &&
        typeof value === 'string' &&
        (value.startsWith('http://') || value.startsWith('https://'))
    );
};

const RichBodyCell: FC<RichBodyCellProps> = ({ children, cell }) => {
    const rawValue = cell.getValue()?.value?.raw;

    if (isUrl(rawValue)) {
        return <Link>{children}</Link>;
    } else {
        return <>{children}</>;
    }
};

export default RichBodyCell;
