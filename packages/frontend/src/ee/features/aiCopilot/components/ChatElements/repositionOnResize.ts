import { type Instance as TippyInstance } from 'tippy.js';

/** Results render after the popup is placed; re-place it when they resize so it can flip. */
export const repositionOnResize = (
    popup: TippyInstance,
    content: HTMLElement,
): (() => void) => {
    const observer = new ResizeObserver(() => {
        void popup.popperInstance?.update();
    });
    observer.observe(content);
    return () => observer.disconnect();
};
