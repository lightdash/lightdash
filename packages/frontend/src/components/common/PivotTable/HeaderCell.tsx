import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface HeaderCellProps {
    className?: string;
    level?: number;
    description?: string;
}

const HeaderCell: FC<HeaderCellProps> = ({
    children = '-',
    className,
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
                className={className}
                sx={(theme) => ({
                    backgroundColor: theme.colors.gray[level],
                })}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default HeaderCell;
