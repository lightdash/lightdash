import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { SidebarPosition } from '../components/common/Page/Sidebar';

type Args = {
    defaultWidth: number;
    minWidth: number;
    maxWidth: number;
    position: SidebarPosition;
};

const useSidebarResize = ({
    maxWidth,
    minWidth,
    defaultWidth,
    position,
}: Args) => {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);

    const startResizing = useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
    }, []);

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
            }
            setSidebarWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
        },
        [isResizing, position, maxWidth, minWidth],
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
