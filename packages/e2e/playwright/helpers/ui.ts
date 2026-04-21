import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Get the text content from a Monaco editor.
 * Equivalent to cy.getMonacoEditorText()
 */
export async function getMonacoEditorText(page: Page): Promise<string> {
    // Wait for the editor to be ready
    await page.waitForTimeout(200);
    await expect(page.locator('.monaco-editor')).toBeVisible();

    const sqlRunnerText = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        if (!win.monaco) {
            throw new Error('Monaco editor not found on window');
        }
        const editor = win.monaco.editor.getModels()[0];
        return editor.getValue();
    });

    // Normalize the text by removing new lines and converting multiple white spaces to single white space
    return sqlRunnerText.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Scrolls the virtualized tree to make a specific item visible.
 * Equivalent to cy.scrollTreeToItem(itemText)
 *
 * This is needed because virtualized lists only render items in the viewport,
 * and standard scrollIntoView() doesn't work with absolute positioning.
 */
export async function scrollTreeToItem(
    page: Page,
    itemText: string,
): Promise<void> {
    const container = page.getByTestId('virtualized-tree-scroll-container');
    await expect(container).toBeVisible({ timeout: 10000 });

    // Scroll incrementally from top to bottom, yielding to the event loop
    // after each step so React's virtualiser gets a chance to render the
    // items for the new scroll position before we look for them.
    const found = await container.evaluate(async (el, text) => {
        const nextFrame = () =>
            new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
            });

        const matchesInDom = () =>
            Array.from(el.querySelectorAll('*')).some((element) => {
                const elementText = element.textContent?.trim() || '';
                const childTexts = Array.from(element.children)
                    .map((child) => child.textContent?.trim() || '')
                    .join('');
                const ownText = elementText.replace(childTexts, '').trim();

                return (
                    elementText === text ||
                    ownText === text ||
                    (elementText.includes(text) &&
                        element.children.length === 0)
                );
            });

        const maxScroll = el.scrollHeight;
        const viewportHeight = el.clientHeight;
        // eslint-disable-next-line no-param-reassign
        el.scrollTop = 0;
        await nextFrame();
        await nextFrame();
        if (matchesInDom()) return true;

        let scrollPosition = 0;
        while (scrollPosition < maxScroll) {
            scrollPosition += viewportHeight * 0.5;
            // eslint-disable-next-line no-param-reassign
            el.scrollTop = scrollPosition;
            // eslint-disable-next-line no-await-in-loop
            await nextFrame();
            // eslint-disable-next-line no-await-in-loop
            await nextFrame();
            if (matchesInDom()) return true;
        }

        // eslint-disable-next-line no-param-reassign
        el.scrollTop = maxScroll;
        await nextFrame();
        await nextFrame();
        return matchesInDom();
    }, itemText);

    if (!found) {
        // Fall back to Playwright's retrying visibility expect, which will
        // keep checking while the virtualiser settles.
        await expect(container.getByText(itemText)).toBeVisible();
    }
}
