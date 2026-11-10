import { Box } from '@mantine/core';
import { useLayoutEffect, useRef, type FC, type ReactNode } from 'react';
import classes from './CanvasZoom.module.css';

type Props = {
    zoom: number;
    children: ReactNode;
};

/**
 * Draws the grid smaller without changing its layout, so tiles keep their
 * size (and charts don't redraw) while the editor sees more of the canvas.
 * Sizes are written straight to the DOM, so a resize never re-renders tiles.
 */
export const CanvasZoom: FC<Props> = ({ zoom, children }) => {
    const canvasRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const isZoomed = zoom !== 1;

    useLayoutEffect(() => {
        const canvas = canvasRef.current;
        const content = contentRef.current;
        if (!canvas || !content || !isZoomed) return;
        canvas.style.setProperty('--canvas-zoom', String(zoom));
        const syncHeight = () =>
            canvas.style.setProperty(
                '--canvas-zoom-height',
                `${content.offsetHeight * zoom}px`,
            );
        syncHeight();
        const observer = new ResizeObserver(syncHeight);
        observer.observe(content);
        return () => observer.disconnect();
    }, [zoom, isZoomed]);

    return (
        <Box
            ref={canvasRef}
            className={classes.canvas}
            data-canvas-zoom
            data-zoomed={isZoomed || undefined}
        >
            <Box ref={contentRef} className={classes.content}>
                {children}
            </Box>
        </Box>
    );
};
