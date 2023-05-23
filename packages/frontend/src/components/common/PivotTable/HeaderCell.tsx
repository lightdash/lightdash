import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface HeaderCellProps {
    className?: string;
    level?: number;
    description?: string;
    textAlign?: 'left' | 'right';
    colSpan?: number;
}

const HeaderCell: FC<HeaderCellProps> = ({
    children = '-',
    className,
    description,
    level = 0,
    textAlign = 'left',
    colSpan,
}) => {
    return (
        <Tooltip
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
                    textAlign,
                })}
                colSpan={colSpan}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default HeaderCell;
