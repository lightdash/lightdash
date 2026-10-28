import { expect, Locator, Page } from '@playwright/test';

declare global {
    interface Window {
        monaco?: {
            editor: { getModels(): Array<{ getValue(): string }> };
        };
    }
}

// Mantine 8 Select puts `name` on a hidden input right after the Select root.
export const selectMantine = async (
    page: Page,
    inputName: string,
    optionLabel: string,
) => {
    const select = page
        .locator(`input[name="${inputName}"]`)
        .locator('xpath=preceding-sibling::*[1]')
        .locator('input');
    // The dropdown is portaled and repositions while the page scrolls, so settle the scroll first.
    await select.scrollIntoViewIfNeeded();
    await select.click();
    await page.getByRole('option', { name: optionLabel }).click();
};

// The save-chart form initialises once spaces and dashboards load and overwrites anything typed
// before that; the modal shows a loading overlay until then.
export const fillChartName = async (page: Page, name: string) => {
    const input = page.getByTestId('ChartCreateModal/NameInput');
    const modal = page.getByRole('dialog').filter({ has: input });
    await expect(modal.locator('.mantine-LoadingOverlay-root')).toHaveCount(0);
    await input.fill(name);
    await expect(input).toHaveValue(name);
};

// Returns the SQL in the first Monaco model, whitespace-normalised.
export const getMonacoEditorText = async (page: Page): Promise<string> => {
    await expect(page.locator('.monaco-editor').first()).toBeAttached();
    await expect
        .poll(() =>
            page.evaluate(() => window.monaco?.editor.getModels().length ?? 0),
        )
        .toBeGreaterThan(0);
    const text = await page.evaluate(() => {
        if (!window.monaco) throw new Error('Monaco is not loaded');
        return window.monaco.editor.getModels()[0].getValue();
    });
    return text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
};

// Scrolls the virtualized explore tree until an item with this exact text is rendered.
export const scrollTreeToItem = async (
    page: Page,
    itemText: string,
): Promise<Locator> => {
    const container = page.getByTestId('virtualized-tree-scroll-container');
    await container.waitFor();
    const item = container.getByText(itemText, { exact: true }).first();
    const { maxScroll, step } = await container.evaluate((el) => {
        el.scrollTo({ top: 0 });
        return { maxScroll: el.scrollHeight, step: el.clientHeight / 2 };
    });
    for (let top = 0; top <= maxScroll; top += step) {
        await container.evaluate((el, scrollTop) => {
            el.scrollTo({ top: scrollTop });
        }, top);
        await page.waitForTimeout(150);
        if ((await item.count()) > 0) {
            await item.scrollIntoViewIfNeeded();
            return item;
        }
    }
    await expect(item).toBeVisible();
    return item;
};

// Drags with real mouse events, which is what react-beautiful-dnd listens for.
export const dragAndDrop = async (
    page: Page,
    dragSelector: string,
    dropSelector: string,
) => {
    const draggable = page.locator(dragSelector).first();
    const droppable = page.locator(dropSelector).first();
    await expect(draggable).toBeVisible();
    await expect(droppable).toBeVisible();
    const draggableId = await draggable.getAttribute(
        'data-rfd-drag-handle-draggable-id',
    );
    const from = await draggable.boundingBox();
    const to = await droppable.boundingBox();
    if (!from || !to) throw new Error('Drag source or target has no bounds');
    const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
    const end = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 5, start.y + 5);
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
    if (draggableId) {
        await expect(
            droppable.locator(`[data-rfd-draggable-id="${draggableId}"]`),
        ).toBeAttached();
    }
};

// The explore page renders two "Run query" buttons; the first is the toolbar one.
export const runQuery = (page: Page) =>
    page.getByRole('button', { name: 'Run query' }).first().click();

// Ace renders a div, so `fill` does not work: focus it and type.
export const typeInAceEditor = async (page: Page, text: string) => {
    await page.locator('#ace-editor').click();
    await page.keyboard.type(text);
};
