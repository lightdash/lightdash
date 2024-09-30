class ResizeObserver {
    observe() {}

    unobserve() {}

    disconnect() {}
}

function mockResizeObserver() {
    window.ResizeObserver = ResizeObserver;
}

export default mockResizeObserver;
