import { Box, Portal, Tooltip, type TooltipProps } from '@mantine/core';
import { type FC } from 'react';
import classes from './CellAnchor.module.css';

type CellTooltipProps = Omit<TooltipProps, 'children'> & {
    elementBounds: DOMRect | null;
};

const CellTooltip: FC<CellTooltipProps> = ({ elementBounds, ...rest }) => (
    <Portal>
        <Tooltip {...rest} opened>
            <Box
                className={classes.anchor}
                style={{
                    '--anchor-left': `${(elementBounds?.x ?? 0) + window.scrollX}px`,
                    '--anchor-top': `${(elementBounds?.y ?? 0) + window.scrollY}px`,
                    '--anchor-width': `${elementBounds?.width ?? 0}px`,
                    '--anchor-height': `${elementBounds?.height ?? 0}px`,
                }}
            />
        </Tooltip>
    </Portal>
);

export default CellTooltip;
