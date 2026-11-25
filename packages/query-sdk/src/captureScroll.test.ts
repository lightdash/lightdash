import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_SCROLL_MESSAGE, mountCaptureScroll } from './captureScroll';

const setScroll = (x: number, y: number) => {
    Object.defineProperty(window, 'scrollX', { value: x, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
};

const sized = (width: number, height: number): HTMLElement => {
    const area = document.createElement('div');
    Object.defineProperty(area, 'clientWidth', { value: width });
    Object.defineProperty(area, 'clientHeight', { value: height });
    document.body.append(area);
    return area;
};

describe('mountCaptureScroll', () => {
    let cleanup: () => void = () => {};
    let frames: FrameRequestCallback[] = [];

    const mount = () => {
        const postMessage = vi.fn();
        cleanup = mountCaptureScroll({ postMessage } as unknown as Window);
        return postMessage;
    };
    const paint = () => {
        const due = frames;
        frames = [];
        due.forEach((frame) => frame(0));
    };

    beforeEach(() => {
        frames = [];
        setScroll(0, 0);
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((frame) =>
            frames.push(frame),
        );
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        document.body.replaceChildren();
    });

    it('says where the page is when it mounts', () => {
        const postMessage = mount();
        expect(postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: CAPTURE_SCROLL_MESSAGE, x: 0, y: 0 },
            '*',
        );
    });

    it('tells the host the offset after a scroll, once per frame', () => {
        const postMessage = mount();
        postMessage.mockClear();
        setScroll(0, 120);
        document.dispatchEvent(new Event('scroll'));
        setScroll(4, 240);
        document.dispatchEvent(new Event('scroll'));
        expect(postMessage).not.toHaveBeenCalled();
        paint();
        expect(postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: CAPTURE_SCROLL_MESSAGE, x: 4, y: 240 },
            '*',
        );
    });

    it('counts an inner area that fills the page, and not a small one', () => {
        const postMessage = mount();
        postMessage.mockClear();
        const list = sized(200, 100);
        list.scrollTop = 50;
        list.dispatchEvent(new Event('scroll'));
        paint();
        expect(postMessage).not.toHaveBeenCalled();

        const main = sized(window.innerWidth, window.innerHeight);
        main.scrollTop = 300;
        main.dispatchEvent(new Event('scroll'));
        paint();
        expect(postMessage).toHaveBeenCalledExactlyOnceWith(
            { type: CAPTURE_SCROLL_MESSAGE, x: 0, y: 300 },
            '*',
        );
    });

    it('a message says the offset, nothing else', () => {
        const postMessage = mount();
        expect(Object.keys(postMessage.mock.calls[0][0]).sort()).toEqual([
            'type',
            'x',
            'y',
        ]);
    });

    it('stops when unmounted', () => {
        const postMessage = mount();
        postMessage.mockClear();
        cleanup();
        document.dispatchEvent(new Event('scroll'));
        paint();
        expect(postMessage).not.toHaveBeenCalled();
    });
});
