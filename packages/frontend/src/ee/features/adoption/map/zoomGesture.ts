type GestureEvent = {
    type: string;
    ctrlKey: boolean;
    metaKey: boolean;
    button?: number;
    touches?: { length: number };
};

// A plain wheel or a one-finger swipe scrolls the page. Zooming takes Ctrl or ⌘, which is
// also how a trackpad pinch arrives, and touch needs two fingers.
export const isZoomGesture = (event: GestureEvent): boolean => {
    if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
    if (event.type.startsWith('touch')) return (event.touches?.length ?? 0) > 1;
    return !event.button && !event.ctrlKey;
};
