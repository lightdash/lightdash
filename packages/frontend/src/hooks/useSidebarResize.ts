import { useCallback, useLayoutEffect, useRef, useState } from 'react';

type Args = {
    defaultWidth: number;
    minWidth: number;
    maxWidth: number;
};

const useSidebarResize = ({ maxWidth, minWidth, defaultWidth }: Args) => {
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

            const newWidth =
                event.clientX - sidebarRef.current.getBoundingClientRect().left;

            setSidebarWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
        },
        [isResizing, minWidth, maxWidth],
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
