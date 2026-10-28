import { SEED_PROJECT, SPACE_TREE_1, SPACE_TREE_2 } from '@lightdash/common';
import {
    expect,
    json,
    loginAs,
    loginWithPermissions,
    scrollTreeToItem,
    SEED_USERS,
    test,
} from '../../support/test';

const apiUrl = '/api/v1';

const JAFFLE_SHOP_SPACE_NAME = SEED_PROJECT.name;
const TREE_1_ROOT_SPACE_NAMES = SPACE_TREE_1.map((space) => space.name);
const TREE_2_ROOT_SPACE_NAMES = SPACE_TREE_2.map((space) => space.name);

test.describe('Space', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('Another non-admin user cannot see private content', async ({
        page,
        api,
    }) => {
        const timestamp = new Date().toISOString();

        // Create private space
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);

        // Close omnibar if it's open
        if (await page.getByText('Search Jaffle shop').isVisible()) {
            await page.keyboard.press('Escape');
        }

        await page.getByRole('button', { name: /^New$/ }).click();
        await page
            .getByText('Organize your saved charts and dashboards.')
            .click();
        await page.getByText('Restricted access', { exact: true }).click();
        const nameInput = page.getByPlaceholder('eg. KPIs');
        await nameInput.click();
        await nameInput.clear();
        await nameInput.pressSequentially(`Private space ${timestamp}`, {
            delay: 50,
        });
        await page.getByRole('button', { name: 'Create' }).click();

        // Wait for space page to load
        await expect(
            page.getByText(`Private space ${timestamp}`).first(),
        ).toBeVisible();
        await expect(page).toHaveURL(/\/spaces\/[0-9a-f-]{36}$/);
        const privateSpaceUrl = page.url();
        const privateSpaceUuid = privateSpaceUrl.split('/').at(-1)!;

        // Create new chart
        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create new chart').click();
        await page.getByText(/^Orders$/).click();
        await (await scrollTreeToItem(page, 'Total order amount')).click();
        await (await scrollTreeToItem(page, 'Status')).click();
        await page.getByText('Save chart').click();
        await expect(page.getByText('Chart name')).toBeVisible();

        const modalBody = page.locator('.mantine-Modal-body');
        const chartNameInput = page.getByTestId('ChartCreateModal/NameInput');
        await chartNameInput.clear();
        // The name is prefilled, so the disabled state only holds once it is cleared
        await expect(
            modalBody.getByRole('button', { name: 'Next' }),
        ).toBeDisabled();
        await chartNameInput.fill(`Private chart ${timestamp}`);
        await expect(chartNameInput).toHaveValue(`Private chart ${timestamp}`);

        // Saves to space by default
        await expect(
            modalBody.getByRole('button', { name: 'Next' }),
        ).toBeEnabled();
        await modalBody.getByRole('button', { name: 'Next' }).click();
        await expect(
            modalBody.getByRole('button', { name: 'Save' }),
        ).toBeEnabled();
        await modalBody.getByRole('button', { name: 'Save' }).click();

        await expect(
            page.getByText('Success! Chart was saved.'),
        ).toBeAttached();
        await expect(page).toHaveURL(/\/saved\/[^/]+\/view$/);
        const privateChartIdentifier = page.url().split('/').at(-2)!;

        const response = await api.post(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/dashboards`,
            {
                data: {
                    name: `Private dashboard ${timestamp}`,
                    spaceUuid: privateSpaceUuid,
                    tiles: [],
                    tabs: [],
                },
            },
        );
        expect(response.status()).toBe(201);
        const privateDashboardUuid = (await json<{ uuid: string }>(response))
            .uuid;

        await page.goto(privateSpaceUrl);

        // Check all items exist in private space
        await page.getByText('All', { exact: true }).click();
        await expect(
            page.getByText(`Private dashboard ${timestamp}`),
        ).toBeVisible();
        await expect(
            page.getByText(`Private chart ${timestamp}`),
        ).toBeVisible();

        await loginWithPermissions(api.raw, 'member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);

        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        // Complete user onboarding
        await page.getByPlaceholder('Select your role').click();
        await page.getByText('Product', { exact: true }).click();
        await page.getByText('Next', { exact: true }).click();

        // Don't show private spaces in navbar
        await page.getByText('Browse', { exact: true }).click();
        await expect(page.getByText('Private space')).toHaveCount(0);

        // Don't show private spaces in spaces page
        await page.getByText('All Spaces').click();
        await expect(
            page.getByText(JAFFLE_SHOP_SPACE_NAME).first(),
        ).toBeVisible();
        await expect(page.getByText('Private space')).toHaveCount(0);

        for (const url of [
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${privateSpaceUuid}`,
            `/api/v2/projects/${SEED_PROJECT.project_uuid}/saved/${privateChartIdentifier}`,
            `/api/v2/projects/${SEED_PROJECT.project_uuid}/dashboards/${privateDashboardUuid}`,
        ]) {
            expect((await api.get(url)).status()).toBe(403);
        }
    });
});

test.describe('Admin access to spaces', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
    });

    test('can see all public spaces and private spaces w/ direct access', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of [
            JAFFLE_SHOP_SPACE_NAME,
            ...TREE_1_ROOT_SPACE_NAMES,
        ]) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }
    });

    test.skip('can see all the spaces on Admin content view', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Admin Content View').click();

        for (const spaceName of [
            JAFFLE_SHOP_SPACE_NAME,
            ...TREE_1_ROOT_SPACE_NAMES,
            ...TREE_2_ROOT_SPACE_NAMES,
        ]) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }
    });

    test.skip('can see nested spaces', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Admin Content View').click();

        await page.getByText('Parent Space 4').click();
        await page.getByText('Child Space 4.1').click();
    });

    test('can see all public and private spaces in admin Tree view', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByRole('button', { name: /^New$/ }).click();
        await page
            .getByText('Arrange multiple charts into a single view.')
            .click();
        await page
            .getByPlaceholder('eg. KPI Dashboard')
            .fill(`Test Dashboard ${new Date().toISOString()}`);

        await page.getByTestId('DashboardCreateModal/Next').click();
        for (const spaceName of TREE_1_ROOT_SPACE_NAMES) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }

        await page.getByText('Admin Content View').click();

        for (const spaceName of [
            ...TREE_1_ROOT_SPACE_NAMES,
            ...TREE_2_ROOT_SPACE_NAMES,
        ]) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }

        const modalBody = page.locator('.mantine-Modal-body');
        await modalBody.getByText('Parent Space 4').click();
        await expect(modalBody.getByText('Child Space 4.1')).toBeVisible();
    });
});

test.describe('Editor access to spaces', () => {
    const EDITOR_ROOT_SPACE_NAMES = TREE_2_ROOT_SPACE_NAMES.concat([
        JAFFLE_SHOP_SPACE_NAME,
        'Parent Space 1',
        'Parent Space 3',
        'Parent Space 5',
    ]);

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.editor);
    });

    test('can see all public spaces and private spaces w/ access', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of EDITOR_ROOT_SPACE_NAMES) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }

        await expect(page.getByText('Parent Space 2')).toHaveCount(0);
    });

    test('can see nested spaces', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Parent Space 4').click();
        await expect(page.getByText('Child Space 4.1').first()).toBeVisible();
    });

    test('can see all public and private spaces w/ access in Tree view', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        await page.getByText('Parent Space 1').click();
        await page.getByText('Child Space 1.1').click();
        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create new dashboard').click();
        await page
            .getByPlaceholder('eg. KPI Dashboard')
            .fill(`Test Dashboard ${new Date().toISOString()}`);

        await page.getByTestId('DashboardCreateModal/Next').click();
        for (const spaceName of EDITOR_ROOT_SPACE_NAMES) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }

        await page.getByText('Parent Space 4').click();
        await expect(page.getByText('Child Space 4.1').first()).toBeVisible();
    });
});

test.describe('Viewer access to spaces', () => {
    const VIEWER_ROOT_SPACE_NAMES = [JAFFLE_SHOP_SPACE_NAME, 'Parent Space 1'];

    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.viewer);
    });

    test('can see all public spaces and private spaces w/ access', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of VIEWER_ROOT_SPACE_NAMES) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }

        await expect(page.getByText('Parent Space 2')).toHaveCount(0);
        await expect(page.getByText('Parent Space 5')).toHaveCount(0);
    });

    test('can see nested spaces', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Parent Space 1').click();
        for (const spaceName of [
            'Child Space 1.1',
            'Child Space 1.2',
            'Child Space 1.3',
        ]) {
            await expect(page.getByText(spaceName).first()).toBeVisible();
        }
    });
});

test.describe('Editor can create content', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.editor);
    });

    test('can create a dashboard from the global New menu', async ({
        page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);

        await page.getByTestId('ExploreMenu/NewButton').click();
        await expect(
            page.getByTestId('ExploreMenu/NewDashboardButton'),
        ).toBeVisible();
    });

    test('can create a new space', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        // Parent Space 1/Child Space 1.1
        await page.getByText('Parent Space 1').click();
        await page.getByText('Child Space 1.1').click();

        const spaceName = `TS ${+new Date()}`;

        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create space').click();
        await page.getByPlaceholder('eg. KPIs').fill(spaceName);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page.getByText(spaceName).first()).toBeVisible();

        await page.getByTestId(`ResourceViewActionMenu/${spaceName}`).click();
        await page.getByText('Delete space').click();
        await page.getByPlaceholder('Space name').fill(spaceName);
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByText(spaceName)).toHaveCount(0);

        // cy.contains(spaceName);
    });

    test('can create/delete a new dashboard', async ({ page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        await page.getByText('Parent Space 1').click();
        await page.getByText('Child Space 1.1').click();

        const dashboardName = `TD ${+new Date()}`;

        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create new dashboard').click();
        await page.getByPlaceholder('eg. KPI Dashboard').fill(dashboardName);
        await page.getByTestId('DashboardCreateModal/Next').click();
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page).toHaveURL(/\/dashboards\/[^/]+\/edit$/);
        await page.goBack();
        await expect(page).toHaveURL(/\/spaces\//);
        await expect(page.getByText(dashboardName).first()).toBeVisible();

        await page
            .getByTestId(`ResourceViewActionMenu/${dashboardName}`)
            .click();
        await page.getByText('Delete dashboard').click();
        await page.getByRole('button', { name: 'Delete' }).click();
    });
});
