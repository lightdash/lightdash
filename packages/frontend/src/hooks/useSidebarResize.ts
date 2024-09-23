import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { PAGE_MIN_CONTENT_WIDTH } from '../components/common/Page/Page';
import { SidebarPosition } from '../components/common/Page/Sidebar';

type Args = {
    defaultWidth: number;
    minWidth: number;
    maxWidth: number;
    position: SidebarPosition;
    mainWidth?: number;
    onResizeStart?: () => void;
    onResizeEnd?: () => void;
};

const useSidebarResize = ({
    maxWidth,
    minWidth,
    defaultWidth,
    position,
    mainWidth,
    onResizeStart,
    onResizeEnd,
}: Args) => {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);

    const startResizing = useCallback(() => {
        setIsResizing(true);
        onResizeStart?.();
    }, [onResizeStart, setIsResizing]);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        onResizeEnd?.();
    }, [onResizeEnd, setIsResizing]);

    const resize = useCallback(
        // mouse event on div
        (event: MouseEvent) => {
            if (!isResizing || !sidebarRef.current) return;
            event.preventDefault();

            const sidebarRect = sidebarRef.current.getBoundingClientRect();
            let newWidth;

            if (position === SidebarPosition.LEFT) {
                newWidth = event.clientX - sidebarRect.left;
            } else {
                newWidth = sidebarRect.right - event.clientX;
                if (mainWidth && mainWidth < PAGE_MIN_CONTENT_WIDTH) {
                    // Allow shrinking but prevent growing when mainWidth < PAGE_MIN_CONTENT_WIDTH
                    if (newWidth > sidebarRect.width) {
                        return;
                    }
                }
            }

            setSidebarWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
        },
        [isResizing, position, maxWidth, minWidth, mainWidth],
    );

    useLayoutEffect(() => {
        if (!isResizing) return;

        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);

        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [isResizing, resize, stopResizing]);

    return { sidebarRef, sidebarWidth, isResizing, startResizing };
};

export default useSidebarResize;
