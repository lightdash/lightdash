import { Portal, Tooltip, type TooltipProps } from '@mantine/core';
import { type FC } from 'react';

type CellTooltipProps = Omit<TooltipProps, 'children'> & {
    elementBounds: DOMRect | null;
};

const CellTooltip: FC<CellTooltipProps> = ({ elementBounds, ...rest }) => (
    <Portal>
        <Tooltip {...rest} opened variant="xs">
            <div
                style={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    zIndex: -1,
                    left: elementBounds?.x ?? 0,
                    top: elementBounds?.y ?? 0,
                    width: elementBounds?.width ?? 0,
                    height: elementBounds?.height ?? 0,
                }}
            />
        </Tooltip>
    </Portal>
);

export default CellTooltip;
