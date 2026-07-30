import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '@playwright/test';

test('admin can open the project home', async ({ page }) => {
    const response = await page.goto(
        `/projects/${SEED_PROJECT.project_uuid}/home`,
    );

    expect(response).not.toBeNull();
    expect(response?.ok()).toBe(true);
    await expect(page).not.toHaveURL(/\/login/);
    await expect(
        page.getByText(SEED_PROJECT.name, { exact: true }).first(),
    ).toBeVisible();
});
