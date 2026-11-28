// Layout sizes are whole pixels, so a value that fits can differ by 1px.
const ROUNDING_PX = 1;

const isTextCut = (element: HTMLElement) =>
    element.scrollHeight - element.clientHeight > ROUNDING_PX ||
    element.scrollWidth - element.clientWidth > ROUNDING_PX;

/**
 * Gives a clamped merged value its full text as a native title, only when the
 * clamp or the column width cuts the text. A value shown in full gets no
 * tooltip. It runs on hover, so it reads the layout at that time, after a
 * column resize or a font load.
 */
export const setTitleWhenTextIsCut = (element: HTMLElement, title: string) => {
    if (isTextCut(element)) {
        element.setAttribute('title', title);
    } else {
        element.removeAttribute('title');
    }
};
