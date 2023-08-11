import { Box, BoxProps, Tooltip } from '@mantine/core';
import { forwardRef } from 'react';
import { usePivotTableCellStyles } from './tableStyles';

export interface CellProps extends BoxProps {
    className?: string;
    tooltipContent?: string;
    component?: 'td' | 'th';

    colSpan?: number;

    withAlignRight?: boolean;
    withGrayBackground?: boolean;
    withMinimalWidth?: boolean;
    withBolderFont?: boolean;
    withLighterBoldFont?: boolean;
    withValue?: boolean;
    withNumericValue?: boolean;

    children?: number | string;
}

const Cell = forwardRef<HTMLTableCellElement, CellProps>(
    (
        {
            className,
            tooltipContent,
            component = 'td',
            colSpan,

            withAlignRight = false,
            withGrayBackground = false,
            withMinimalWidth = false,
            withBolderFont = false,
            withLighterBoldFont = false,
            withValue = false,
            withNumericValue = false,

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
                    component={component}
                    colSpan={colSpan}
                    {...rest}
                    className={cx(
                        classes.root,
                        withGrayBackground ? classes.withGrayBackground : null,
                        withAlignRight ? classes.withAlignRight : null,
                        withNumericValue ? classes.withNumericValue : null,
                        withMinimalWidth ? classes.withMinimalWidth : null,
                        withBolderFont ? classes.withBolderFont : null,
                        withLighterBoldFont
                            ? classes.withLighterBoldFont
                            : null,
                        withValue ? classes.withValue : null,
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
