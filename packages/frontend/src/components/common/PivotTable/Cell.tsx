import { Box, BoxProps, Tooltip } from '@mantine/core';
import { FC } from 'react';
import { usePivotTableCellStyles } from './tableStyles';

interface CellProps {
    className?: string;
    tooltipContent?: string;

    boxProps?: BoxProps;

    colSpan?: number;

    isHeaderCell?: boolean;
    withAlignRight?: boolean;
    withGrayBackground?: boolean;
    withMinimalWidth?: boolean;
    withBolderFont?: boolean;
}

const Cell: FC<CellProps> = ({
    tooltipContent,

    colSpan,

    isHeaderCell = false,
    withAlignRight = false,
    withGrayBackground = false,
    withMinimalWidth = false,
    withBolderFont = false,

    children,
}) => {
    const { cx, classes } = usePivotTableCellStyles({});

    return (
        <Tooltip
            withinPortal
            multiline
            disabled={!tooltipContent}
            label={tooltipContent}
        >
            <Box
                component={isHeaderCell ? 'th' : 'td'}
                colSpan={colSpan}
                className={cx(
                    classes.root,
                    withGrayBackground ? classes.withGrayBackground : undefined,
                    withAlignRight ? classes.withAlignRight : undefined,
                    withMinimalWidth ? classes.withMinimalWidth : undefined,
                    withBolderFont ? classes.withBolderFont : undefined,
                )}
            >
                {children}
            </Box>
        </Tooltip>
    );
};

export default Cell;
