import { Box } from '@mantine/core';
import { FC } from 'react';

type IndexCellProps = {
    label: string | undefined;
};

const IndexCell: FC<IndexCellProps> = ({ label }) => {
    return (
        <Box
            component="td"
            sx={(theme) => ({
                fontWeight: 600,
                backgroundColor: theme.colors.gray[0],
            })}
        >
            {label || '-'}
        </Box>
    );
};

export default IndexCell;
