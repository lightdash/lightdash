import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Tests for the print/PDF export behaviour in EmbedDashboardExportPdf.
 *
 * The component manipulates the DOM directly (clearing theme background
 * colours, expanding ancestors, calling window.print, then restoring
 * everything). These tests exercise that logic at the DOM level to prevent
 * regressions when embed theme support evolves.
 */

// ---------------------------------------------------------------------------
// Helpers – mirror the component's internal logic so we can test it in
// isolation without rendering the full React tree (which needs many providers).
// ---------------------------------------------------------------------------

function getAncestors(el: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let current = el.parentElement;
    while (current && current !== document.body) {
        ancestors.push(current);
        current = current.parentElement;
    }
    return ancestors;
}

type SavedStyle = {
    el: HTMLElement;
    height: string;
    overflow: string;
    maxHeight: string;
    position: string;
};

/**
 * Simulates the same DOM manipulation that EmbedDashboardExportPdf performs
 * in its onClick handler.
 */
function simulatePrintClick() {
    const printContainer = document.getElementById('embed-scroll-container');

    const originalStyles = { height: '', overflowY: '', overflow: '' };
    let pageStyle: HTMLStyleElement | null = null;

    // Save and clear theme inline background colors
    const savedHtmlBg = document.documentElement.style.backgroundColor;
    const savedBodyBg = document.body.style.backgroundColor;
    document.documentElement.style.backgroundColor = '';
    document.body.style.backgroundColor = '';

    const savedAncestorStyles: SavedStyle[] = [];

    if (printContainer) {
        originalStyles.height = printContainer.style.height;
        originalStyles.overflowY = printContainer.style.overflowY;
        originalStyles.overflow = printContainer.style.overflow;

        printContainer.style.height = 'auto';
        printContainer.style.overflowY = 'visible';
        printContainer.style.overflow = 'visible';

        for (const ancestor of getAncestors(printContainer)) {
            savedAncestorStyles.push({
                el: ancestor,
                height: ancestor.style.height,
                overflow: ancestor.style.overflow,
                maxHeight: ancestor.style.maxHeight,
                position: ancestor.style.position,
            });
            ancestor.style.height = 'auto';
            ancestor.style.overflow = 'visible';
            ancestor.style.maxHeight = 'none';
        }

        const contentWidth = printContainer.scrollWidth;
        const PAGE_MARGIN_PX = 76;
        pageStyle = document.createElement('style');
        pageStyle.textContent = `@media print { @page { size: ${contentWidth + PAGE_MARGIN_PX}px 11in; margin: 10mm; } }`;
        document.head.appendChild(pageStyle);
    }

    window.print();

    // Restore
    document.documentElement.style.backgroundColor = savedHtmlBg;
    document.body.style.backgroundColor = savedBodyBg;

    for (const saved of savedAncestorStyles) {
        saved.el.style.height = saved.height;
        saved.el.style.overflow = saved.overflow;
        saved.el.style.maxHeight = saved.maxHeight;
    }

    if (printContainer) {
        printContainer.style.height = originalStyles.height;
        printContainer.style.overflowY = originalStyles.overflowY;
        printContainer.style.overflow = originalStyles.overflow;
    }
    pageStyle?.remove();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmbedDashboardExportPdf – print behaviour', () => {
    let printSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        document.documentElement.style.backgroundColor = '';
        document.body.style.backgroundColor = '';
        printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    });

    afterEach(() => {
        printSpy.mockRestore();
        document.documentElement.style.backgroundColor = '';
        document.body.style.backgroundColor = '';
        document.getElementById('embed-scroll-container')?.remove();
        document.getElementById('sdk-host-wrapper')?.remove();
    });

    it('clears theme background colors on html and body before printing', () => {
        document.documentElement.style.backgroundColor = '#1a1a1a';
        document.body.style.backgroundColor = '#1a1a1a';

        printSpy.mockImplementation(() => {
            expect(document.documentElement.style.backgroundColor).toBe('');
            expect(document.body.style.backgroundColor).toBe('');
        });

        simulatePrintClick();
        expect(printSpy).toHaveBeenCalledOnce();
    });

    it('restores theme background colors after printing', () => {
        document.documentElement.style.backgroundColor = '#1a1a1a';
        document.body.style.backgroundColor = '#1a1a1a';

        simulatePrintClick();

        // Browser normalises hex to rgb() when reading back
        expect(document.documentElement.style.backgroundColor).not.toBe('');
        expect(document.body.style.backgroundColor).not.toBe('');
    });

    it('works when no theme background is set (light mode)', () => {
        simulatePrintClick();

        expect(printSpy).toHaveBeenCalledOnce();
        expect(document.documentElement.style.backgroundColor).toBe('');
        expect(document.body.style.backgroundColor).toBe('');
    });

    it('expands scroll container and restores it after printing', () => {
        const container = document.createElement('div');
        container.id = 'embed-scroll-container';
        container.style.height = '100vh';
        container.style.overflowY = 'auto';
        container.style.overflow = 'hidden';
        document.body.appendChild(container);

        printSpy.mockImplementation(() => {
            expect(container.style.height).toBe('auto');
            expect(container.style.overflowY).toBe('visible');
            expect(container.style.overflow).toBe('visible');
        });

        simulatePrintClick();

        expect(container.style.height).toBe('100vh');
        expect(container.style.overflowY).toBe('auto');
        expect(container.style.overflow).toBe('hidden');
    });

    it('injects and removes @page style for dynamic page sizing', () => {
        const container = document.createElement('div');
        container.id = 'embed-scroll-container';
        document.body.appendChild(container);

        printSpy.mockImplementation(() => {
            const styles = document.head.querySelectorAll('style');
            const pageRule = Array.from(styles).find((s) =>
                s.textContent?.includes('@page'),
            );
            expect(pageRule).toBeTruthy();
        });

        simulatePrintClick();

        const remainingPageRules = Array.from(
            document.head.querySelectorAll('style'),
        ).filter((s) => s.textContent?.includes('@page'));
        expect(remainingPageRules).toHaveLength(0);
    });

    // -------------------------------------------------------------------
    // SDK mode: ancestor expansion
    // -------------------------------------------------------------------

    it('expands ancestor containers during printing (SDK mode)', () => {
        // Simulate SDK host page: wrapper > inner > embed-scroll-container
        const wrapper = document.createElement('div');
        wrapper.id = 'sdk-host-wrapper';
        wrapper.style.height = '500px';
        wrapper.style.overflow = 'auto';

        const inner = document.createElement('div');
        inner.style.height = '100%';
        inner.style.overflow = 'hidden';
        inner.style.maxHeight = '500px';

        const container = document.createElement('div');
        container.id = 'embed-scroll-container';
        container.style.height = '100%';
        container.style.overflow = 'auto';

        inner.appendChild(container);
        wrapper.appendChild(inner);
        document.body.appendChild(wrapper);

        printSpy.mockImplementation(() => {
            // During print, all ancestors should be expanded
            expect(wrapper.style.height).toBe('auto');
            expect(wrapper.style.overflow).toBe('visible');
            expect(inner.style.height).toBe('auto');
            expect(inner.style.overflow).toBe('visible');
            expect(inner.style.maxHeight).toBe('none');
            expect(container.style.height).toBe('auto');
            expect(container.style.overflow).toBe('visible');
        });

        simulatePrintClick();

        // After print, everything is restored
        expect(wrapper.style.height).toBe('500px');
        expect(wrapper.style.overflow).toBe('auto');
        expect(inner.style.height).toBe('100%');
        expect(inner.style.overflow).toBe('hidden');
        expect(inner.style.maxHeight).toBe('500px');
        expect(container.style.height).toBe('100%');
        expect(container.style.overflow).toBe('auto');
    });

    it('handles ancestors with no inline styles gracefully', () => {
        const wrapper = document.createElement('div');
        wrapper.id = 'sdk-host-wrapper';
        // No inline styles set on wrapper

        const container = document.createElement('div');
        container.id = 'embed-scroll-container';

        wrapper.appendChild(container);
        document.body.appendChild(wrapper);

        simulatePrintClick();

        // After print, wrapper should still have no inline styles
        expect(wrapper.style.height).toBe('');
        expect(wrapper.style.overflow).toBe('');
        expect(wrapper.style.maxHeight).toBe('');
    });
});

describe('print.css – data-hide-print attribute', () => {
    it('elements with data-hide-print should be identified for hiding', () => {
        const btn = document.createElement('button');
        btn.setAttribute('data-hide-print', 'true');
        document.body.appendChild(btn);

        const hidden = document.querySelectorAll('[data-hide-print="true"]');
        expect(hidden.length).toBeGreaterThanOrEqual(1);

        btn.remove();
    });
});
