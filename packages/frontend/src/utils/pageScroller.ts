export const PAGE_SCROLLER_ID = 'page-scroller';

/**
 * What a full page scrolls in: the page card of the left navigation shell
 * when it is on screen, otherwise the window.
 */
export const getPageScroller = (): HTMLElement | Window =>
    document.getElementById(PAGE_SCROLLER_ID) ?? window;

export const getPageScrollTop = (): number =>
    document.getElementById(PAGE_SCROLLER_ID)?.scrollTop ?? window.scrollY;
