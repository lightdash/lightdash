import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
    SEED_ORG_1_EDITOR_EMAIL,
    SEED_ORG_1_EDITOR_PASSWORD,
    SEED_ORG_1_VIEWER_EMAIL,
    SEED_ORG_1_VIEWER_PASSWORD,
    SEED_ORG_2_ADMIN_EMAIL,
    SEED_ORG_2_ADMIN_PASSWORD,
} from '@lightdash/common';
import { expect, test as setup } from '@playwright/test';

const authDir = 'playwright/.auth';

async function loginAndSaveState(
    page: import('@playwright/test').Page,
    email: string,
    password: string,
    statePath: string,
) {
    const response = await page.request.post('api/v1/login', {
        data: { email, password },
    });
    expect(response.status()).toBe(200);

    // Validate the session works
    const userResponse = await page.request.get('api/v1/user');
    expect(userResponse.status()).toBe(200);

    await page.context().storageState({ path: statePath });
}

setup('authenticate as admin', async ({ page }) => {
    await loginAndSaveState(
        page,
        SEED_ORG_1_ADMIN_EMAIL.email,
        SEED_ORG_1_ADMIN_PASSWORD.password,
        `${authDir}/admin.json`,
    );
});

setup('authenticate as editor', async ({ page }) => {
    await loginAndSaveState(
        page,
        SEED_ORG_1_EDITOR_EMAIL.email,
        SEED_ORG_1_EDITOR_PASSWORD.password,
        `${authDir}/editor.json`,
    );
});

setup('authenticate as viewer', async ({ page }) => {
    await loginAndSaveState(
        page,
        SEED_ORG_1_VIEWER_EMAIL.email,
        SEED_ORG_1_VIEWER_PASSWORD.password,
        `${authDir}/viewer.json`,
    );
});

setup('authenticate as org2 admin', async ({ page }) => {
    await loginAndSaveState(
        page,
        SEED_ORG_2_ADMIN_EMAIL.email,
        SEED_ORG_2_ADMIN_PASSWORD.password,
        `${authDir}/org2Admin.json`,
    );
});
