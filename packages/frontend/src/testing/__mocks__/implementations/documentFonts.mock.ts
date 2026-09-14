// jsdom has no CSS Font Loading API; Mantine's Textarea autosize subscribes to
// document.fonts on mount.
function mockDocumentFonts() {
    if ('fonts' in document) return;
    Object.defineProperty(document, 'fonts', {
        configurable: true,
        value: {
            ready: Promise.resolve(),
            status: 'loaded',
            addEventListener: () => {},
            removeEventListener: () => {},
        },
    });
}

export default mockDocumentFonts;
