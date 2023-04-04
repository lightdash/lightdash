import { TitleFieldValue } from '@lightdash/common';
import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface TitleCellProps {
    title: TitleFieldValue;
    description?: string;
    level?: number;
    isEmpty: boolean;
    isHeaderTitle: boolean;
}

const TitleCell: FC<TitleCellProps> = ({
    children,
    description,
    level = 1,
    isEmpty,
    isHeaderTitle,
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
        </Tooltip>
    );
};

export default TitleCell;
