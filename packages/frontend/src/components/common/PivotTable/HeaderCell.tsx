import { Box } from '@mantine/core';
import { FC } from 'react';

interface HeaderCellProps {
    level?: number;
}

const HeaderCell: FC<HeaderCellProps> = ({ children = '-', level = 0 }) => {
    return (
        <Box
            component="th"
            sx={(theme) => ({
                fontWeight: 600,
                backgroundColor: theme.colors.gray[level - 1],
            })}
        >
            {children}
        </Box>
    );
};

export default HeaderCell;
