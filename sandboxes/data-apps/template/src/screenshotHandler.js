/**
 * Listens for screenshot requests from the parent window and responds
 * with a serialized HTML snapshot of the current DOM.
 *
 * The parent does the actual rendering/capture — the sandboxed iframe
 * only serializes its own DOM (which it has full access to).
 */

/**
 * Inline all accessible stylesheet rules into <style> tags on the clone,
 * then remove <link> tags so the snapshot is self-contained.
 */
function inlineStyles(doc) {
    for (const sheet of document.styleSheets) {
        try {
            const rules = sheet.cssRules;
            if (!rules) continue;
            const style = doc.createElement('style');
            let css = '';
            for (const rule of rules) {
                css += rule.cssText + '\n';
            }
            style.textContent = css;
            doc.head.appendChild(style);
        } catch {
            // Cross-origin stylesheet — skip
        }
    }
    for (const link of doc.querySelectorAll('link[rel="stylesheet"]')) {
        link.remove();
    }
}

function initScreenshotHandler() {
    window.addEventListener('message', (event) => {
        const { data } = event;
        if (data?.type !== 'lightdash:sdk:screenshot-request') return;

        const { id } = data;

        try {
            const width = document.documentElement.scrollWidth;
            const height = document.documentElement.scrollHeight;

            // Clone so we don't mutate the live page
            const clone = document.documentElement.cloneNode(true);
            const doc = document.implementation.createHTMLDocument('');
            doc.replaceChild(clone, doc.documentElement);
            inlineStyles(doc);

            const html = doc.documentElement.outerHTML;

            window.parent.postMessage(
                {
                    type: 'lightdash:sdk:screenshot-response',
                    id,
                    html,
                    width,
                    height,
                },
                '*',
            );
        } catch (err) {
            window.parent.postMessage(
                {
                    type: 'lightdash:sdk:screenshot-response',
                    id,
                    error:
                        err instanceof Error
                            ? err.message
                            : 'Screenshot failed',
                },
                '*',
            );
        }
    });
}

export default initScreenshotHandler;
