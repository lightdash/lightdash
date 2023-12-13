import { Portal, Tooltip, TooltipProps } from '@mantine/core';
import { FC } from 'react';

type CellTooltipProps = Omit<TooltipProps, 'children'> & {
    elementBounds: DOMRect;
};

const CellTooltip: FC<CellTooltipProps> = ({ elementBounds, ...rest }) => (
    <Portal>
        <Tooltip {...rest} opened>
            <div
                style={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    zIndex: -1,
                    left: elementBounds.x,
                    top: elementBounds.y,
                    width: elementBounds.width,
                    height: elementBounds.height,
                }}
            />
        </Tooltip>
    </Portal>
);

export default CellTooltip;
