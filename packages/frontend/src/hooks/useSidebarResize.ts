import React, { useRef, useState } from 'react';

type Args = {
    defaultWidth: number;
    minWidth: number;
    maxWidth: number;
};

const useSidebarResize = ({ maxWidth, minWidth, defaultWidth }: Args) => {
    const sidebarRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);
    const [sidebarWidth, setSidebarWidth] = useState(defaultWidth);

    const startResizing = React.useCallback(() => {
        setIsResizing(true);
    }, []);

    const stopResizing = React.useCallback(() => {
        setIsResizing(false);
    }, []);

    const resize = React.useCallback(
        (mouseMoveEvent) => {
            if (isResizing && sidebarRef.current) {
                mouseMoveEvent.preventDefault();
                const newWidth =
                    mouseMoveEvent.clientX -
                    sidebarRef.current.getBoundingClientRect().left;
                setSidebarWidth(
                    Math.min(maxWidth, Math.max(minWidth, newWidth)),
                );
            }
        },
        [isResizing, minWidth, maxWidth],
    );

    React.useEffect(() => {
        window.addEventListener('mousemove', resize);
        window.addEventListener('mouseup', stopResizing);
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
        };
    }, [resize, stopResizing]);

    return { sidebarRef, sidebarWidth, isResizing, startResizing };
};

export default useSidebarResize;
