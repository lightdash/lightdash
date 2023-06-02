import { Box, BoxProps, Tooltip } from '@mantine/core';
import { forwardRef } from 'react';
import { usePivotTableCellStyles } from './tableStyles';

export interface CellProps extends BoxProps {
    className?: string;
    tooltipContent?: string;

    colSpan?: number;

    isHeaderCell?: boolean;
    withAlignRight?: boolean;
    withGrayBackground?: boolean;
    withMinimalWidth?: boolean;
    withBolderFont?: boolean;
    withValue?: boolean;
}

const Cell = forwardRef<HTMLTableCellElement, CellProps>(
    (
        {
            className,
            tooltipContent,

            colSpan,

            isHeaderCell = false,
            withAlignRight = false,
            withGrayBackground = false,
            withMinimalWidth = false,
            withBolderFont = false,
            withValue = false,

            children,

            ...rest
        },
        ref,
    ) => {
        const { cx, classes } = usePivotTableCellStyles({});

        return (
            <Tooltip
                withinPortal
                multiline
                disabled={!tooltipContent}
                label={tooltipContent}
            >
                <Box
                    ref={ref}
                    component={isHeaderCell ? 'th' : 'td'}
                    colSpan={colSpan}
                    {...rest}
                    className={cx(
                        classes.root,
                        withGrayBackground
                            ? classes.withGrayBackground
                            : undefined,
                        withAlignRight ? classes.withAlignRight : undefined,
                        withMinimalWidth ? classes.withMinimalWidth : undefined,
                        withBolderFont ? classes.withBolderFont : undefined,
                        withValue ? classes.withValue : undefined,
                        className,
                    )}
                >
                    {children}
                </Box>
            </Tooltip>
        );
    },
);

export default Cell;
