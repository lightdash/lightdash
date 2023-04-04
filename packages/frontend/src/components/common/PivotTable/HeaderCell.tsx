import { Box } from '@mantine/core';
import { FC } from 'react';

type HeaderCellProps = {
    label: string | undefined;
    level?: number;
};

const HeaderCell: FC<HeaderCellProps> = ({ label, level = 0 }) => {
    return (
        <Box
            component="th"
            sx={(theme) => ({
                fontWeight: 600,
                backgroundColor: theme.colors.gray[level - 1],
            })}
        >
            {label || '-'}
        </Box>
    );
};

export default HeaderCell;
