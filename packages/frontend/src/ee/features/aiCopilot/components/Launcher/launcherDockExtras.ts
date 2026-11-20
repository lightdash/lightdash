import { useEffect, useState } from 'react';

export const LAUNCHER_DOCK_EXTRAS_ID = 'ai-launcher-dock-extras';

/** The slot in the agent dock for other features' buttons, once it is on the page. */
export const useLauncherDockExtras = (): HTMLElement | null => {
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const find = () =>
            setSlot(document.getElementById(LAUNCHER_DOCK_EXTRAS_ID));
        find();
        const observer = new MutationObserver(find);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, []);
    return slot;
};
