import { TitleFieldValue } from '@lightdash/common';
import { Box } from '@mantine/core';
import { FC } from 'react';

interface TitleCellProps {
    title: TitleFieldValue;
    level?: number;
}

const TitleCell: FC<TitleCellProps> = ({ children, title, level = 1 }) => {
    const isEmpty = !title?.fieldId;
    const isHeaderTitle = title?.titleDirection === 'header';

    return (
        <Box
            component="th"
            ta="right"
            style={{
                textAlign: isHeaderTitle ? 'right' : undefined,
            }}
            sx={(theme) => ({
                fontWeight: 600,
                backgroundColor: isEmpty
                    ? theme.white
                    : isHeaderTitle
                    ? theme.colors.gray[level - 1]
                    : theme.colors.gray[0],
            })}
        >
            {children}
        </Box>
    );
};

export default TitleCell;
