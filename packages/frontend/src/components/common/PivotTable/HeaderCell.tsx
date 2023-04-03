import { Box } from '@mantine/core';
import { FC } from 'react';

type HeaderCellProps = {
    label: string | undefined;
};

const HeaderCell: FC<HeaderCellProps> = ({ label }) => {
    return (
        <Box
            component="th"
            sx={(theme) => ({
                fontWeight: 600,
                backgroundColor: theme.colors.gray[0],
            })}
        >
            {label || '-'}
        </Box>
    );
};

export default HeaderCell;
