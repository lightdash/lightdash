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

    const found = await container.evaluate((el, text) => {
        const maxScroll = el.scrollHeight;
        const viewportHeight = el.clientHeight;
        // eslint-disable-next-line no-param-reassign
        el.scrollTop = 0;

        // Try to find the item by scrolling incrementally
        let scrollPosition = 0;
        while (scrollPosition < maxScroll) {
            // eslint-disable-next-line no-param-reassign
            el.scrollTop = scrollPosition;
            const elements = Array.from(el.querySelectorAll('*'));
            const match = elements.find((element) => {
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

            if (match) {
                return true;
            }

            scrollPosition += viewportHeight * 0.5;
        }

        // Final check at bottom
        // eslint-disable-next-line no-param-reassign
        el.scrollTop = maxScroll;
        return false;
    }, itemText);

    if (!found) {
        // Fall back to looking for the text directly
        await expect(container.getByText(itemText)).toBeVisible();
    }
}
