import { type Editor } from '@tiptap/core';
import { type Instance as TippyInstance } from 'tippy.js';

/** Anchors a mention menu to the composer's left edge, on the caret's line. */
export const composerAnchorRect = (
    editor: Editor,
    caret: DOMRect | null | undefined,
): DOMRect => {
    const composer = editor.view.dom.getBoundingClientRect();
    const line = caret ?? composer;
    return new DOMRect(composer.left, line.top, composer.width, line.height);
};

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
