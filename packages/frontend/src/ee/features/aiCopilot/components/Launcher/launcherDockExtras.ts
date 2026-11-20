import { useEffect, useState } from 'react';

export const LAUNCHER_DOCK_EXTRAS_ID = 'ai-launcher-dock-extras';

/** The slot in an open conversation's composer for other features' buttons. */
export const LAUNCHER_THREAD_EXTRAS_ID = 'ai-launcher-thread-extras';

/** An element other features put buttons into, once it is on the page. */
const useLauncherSlot = (id: string): HTMLElement | null => {
    const [slot, setSlot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        const find = () => setSlot(document.getElementById(id));
        find();
        const observer = new MutationObserver(find);
        observer.observe(document.body, { childList: true, subtree: true });
        return () => observer.disconnect();
    }, [id]);
    return slot;
};

/** The slot in the agent dock for other features' buttons. */
export const useLauncherDockExtras = (): HTMLElement | null =>
    useLauncherSlot(LAUNCHER_DOCK_EXTRAS_ID);

/** The slot beside the composer of the conversation open in the panel. */
export const useLauncherThreadExtras = (): HTMLElement | null =>
    useLauncherSlot(LAUNCHER_THREAD_EXTRAS_ID);
