import { useLayoutEffect, useState, type PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import classes from './StableContent.module.css';

/** Move the same portal host between layouts without remounting its children. */
export const StableContent = ({
    target,
    children,
}: PropsWithChildren<{ target: HTMLElement | null }>) => {
    const [host] = useState(() => document.createElement('div'));

    useLayoutEffect(() => {
        host.className = classes.host;
        target?.appendChild(host);
        return () => host.remove();
    }, [host, target]);

    return createPortal(children, host);
};
