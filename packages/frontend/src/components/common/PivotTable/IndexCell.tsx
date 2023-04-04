import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface IndexCellProps {
    description?: string;
}

const IndexCell: FC<IndexCellProps> = ({ children = '-', description }) => {
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
                sx={(theme) => ({
                    fontWeight: 600,
                    backgroundColor: theme.colors.gray[0],
                })}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default IndexCell;
