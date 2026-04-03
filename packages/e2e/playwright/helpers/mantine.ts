import type { Page } from '@playwright/test';

/**
 * Select an option from a Mantine Select component.
 * Equivalent to cy.selectMantine(inputName, optionLabel)
 *
 * Cypress version:
 *   cy.get(`input[name="${inputName}"]`).parent().click()
 *     .parent('.mantine-Select-root').contains(optionLabel).click()
 */
export async function selectMantine(
    page: Page,
    inputName: string,
    optionLabel: string,
): Promise<void> {
    // Click the parent of the input to open the dropdown
    const input = page.locator(`input[name="${inputName}"]`);
    await input.locator('..').click();

    // Find the Select root ancestor and click the matching option
    const selectRoot = page.locator('.mantine-Select-root').filter({
        has: page.locator(`input[name="${inputName}"]`),
    });
    await selectRoot.getByText(optionLabel).click();
}
