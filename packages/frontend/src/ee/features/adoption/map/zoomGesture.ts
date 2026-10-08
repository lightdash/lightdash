type GestureEvent = {
    type: string;
    ctrlKey: boolean;
    metaKey: boolean;
    button?: number;
    touches?: { length: number };
};

// A plain wheel scrolls the page; zooming takes Ctrl or ⌘, which is also how a trackpad pinch arrives.
// One finger scrolls the page at the reset view and moves the map once it is zoomed in.
export const isZoomGesture = (
    event: GestureEvent,
    currentScale: number = 1,
): boolean => {
    if (event.type === 'wheel') return event.ctrlKey || event.metaKey;
    if (event.type.startsWith('touch')) {
        return (event.touches?.length ?? 0) > 1 || currentScale > 1;
    }
    return !event.button && !event.ctrlKey;
};
