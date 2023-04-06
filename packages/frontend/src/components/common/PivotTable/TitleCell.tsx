import { Box, Tooltip } from '@mantine/core';
import { FC } from 'react';

interface TitleCellProps {
    className?: string;
    description?: string;
    level?: number;
    isEmpty: boolean;
    isHeaderTitle: boolean;
}

const TitleCell: FC<TitleCellProps> = ({
    children,
    className,
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
                className={className}
                style={{
                    textAlign: isHeaderTitle ? 'right' : undefined,
                }}
                sx={(theme) => ({
                    backgroundColor: isEmpty
                        ? theme.white
                        : isHeaderTitle
                        ? theme.colors.gray[level]
                        : theme.colors.gray[0],
                })}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default TitleCell;
