import { TitleFieldValue } from '@lightdash/common';
import { Box } from '@mantine/core';
import { FC } from 'react';

type TitleCellProps = {
    title: TitleFieldValue;
    getLabel: (fieldId: string | null | undefined) => string;
    level?: number;
};
const TitleCell: FC<TitleCellProps> = ({ title, getLabel, level = 1 }) => {
    const label = getLabel(title?.fieldId);

    const isEmpty = label === '';
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
            {label}
        </Box>
    );
};

export default TitleCell;
