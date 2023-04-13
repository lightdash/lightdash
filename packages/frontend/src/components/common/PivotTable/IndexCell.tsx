import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface IndexCellProps {
    className?: string;
    description?: string;
}

const IndexCell: FC<IndexCellProps> = ({
    children = '-',
    description,
    className,
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
                component="td"
                className={className}
                sx={(theme) => ({
                    backgroundColor: theme.colors.gray[0],
                })}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default IndexCell;
