import '@testing-library/jest-dom/vitest';

class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', { value: ResizeObserver });

Object.defineProperty(globalThis, 'requestAnimationFrame', {
    value: (callback: FrameRequestCallback) =>
        setTimeout(() => callback(Date.now()), 16) as unknown as number,
    configurable: true,
    writable: true,
});
Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    value: (handle: number) => clearTimeout(handle),
    configurable: true,
    writable: true,
});

if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
}

if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
}

if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
}
