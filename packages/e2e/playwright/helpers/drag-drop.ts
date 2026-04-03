import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Drag and drop an element to a target.
 * Equivalent to cy.dragAndDrop(dragSelector, dropSelector)
 *
 * Uses mouse events to simulate drag-and-drop for react-beautiful-dnd,
 * which requires mousedown → mousemove → mousemove → mouseup sequence.
 */
export async function dragAndDrop(
    page: Page,
    dragSelector: string,
    dropSelector: string,
): Promise<void> {
    const dragElement = page.locator(dragSelector);
    const dropElement = page.locator(dropSelector);

    await expect(dragElement).toBeVisible();
    await expect(dropElement).toBeVisible();

    const draggableId = await dragElement.getAttribute(
        'data-rfd-drag-handle-draggable-id',
    );

    const dragBox = await dragElement.boundingBox();
    const dropBox = await dropElement.boundingBox();

    if (!dragBox || !dropBox) {
        throw new Error('Could not get bounding boxes for drag/drop elements');
    }

    const startX = dragBox.x + dragBox.width / 2;
    const startY = dragBox.y + dragBox.height / 2;
    const endX = dropBox.x + dropBox.width / 2;
    const endY = dropBox.y + dropBox.height / 2;

    // Simulate the drag-and-drop with mouse events
    await page.mouse.move(startX, startY);
    await page.mouse.down();

    // Small move to trigger drag detection
    await page.mouse.move(startX + 5, startY + 5, { steps: 2 });
    await page.waitForTimeout(50);

    // Move to drop target
    await page.mouse.move(endX, endY, { steps: 5 });
    await page.waitForTimeout(50);

    // Release
    await page.mouse.up();

    // Allow React to update the DOM
    await page.waitForTimeout(200);

    // Verify the drag was successful if we have a draggable ID
    if (draggableId) {
        await expect(
            dropElement.locator(
                `[data-rfd-draggable-id="${draggableId}"]`,
            ),
        ).toBeVisible();
    }
}
