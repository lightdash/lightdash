import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface HeaderCellProps {
    level?: number;
    description?: string;
}

const HeaderCell: FC<HeaderCellProps> = ({
    children = '-',
    description,
    level = 0,
}) => {
    return (
        <Tooltip
            withArrow
            withinPortal
            multiline
            disabled={!description}
            label={description}
        >
            <Box
                component="th"
                sx={(theme) => ({
                    fontWeight: 600,
                    backgroundColor: theme.colors.gray[level - 1],
                })}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default HeaderCell;
