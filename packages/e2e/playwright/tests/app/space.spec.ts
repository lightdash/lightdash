/* eslint-disable no-restricted-syntax */
import { SEED_PROJECT, SPACE_TREE_1, SPACE_TREE_2 } from '@lightdash/common';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures';
import { loginWithPermissions, scrollTreeToItem } from '../../helpers';

const apiUrl = '/api/v1';

const JAFFLE_SHOP_SPACE_NAME = SEED_PROJECT.name;
const TREE_1_ROOT_SPACE_NAMES = SPACE_TREE_1.map((space) => space.name);
const TREE_2_ROOT_SPACE_NAMES = SPACE_TREE_2.map((space) => space.name);

test.describe('Space', () => {
    const createPrivateSpace = async (page: Page) => {
        const timestamp = new Date().toISOString();

        // Create private space
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);

        // Close omnibar if it's open
        const bodyText = await page.locator('body').textContent();
        if (bodyText && bodyText.includes('Search Jaffle shop')) {
            await page.keyboard.press('Escape');
        }

        await page.getByText('New').click();
        await page
            .getByText('Organize your saved charts and dashboards.')
            .click();
        await page.getByText('Restricted access').click();
        await page.getByPlaceholder('eg. KPIs').click();
        await page.getByPlaceholder('eg. KPIs').clear();
        await page
            .getByPlaceholder('eg. KPIs')
            .fill(`Private space ${timestamp}`);
        await page.getByRole('button', { name: 'Create' }).click();

        // Wait for space page to load
        await expect(
            page.getByText(`Private space ${timestamp}`),
        ).toBeVisible();

        // Create new chart
        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create new chart').click();
        await page.getByText(/^Orders$/).click();
        await scrollTreeToItem(page, 'Total order amount');
        await page.getByText('Total order amount').click();
        await scrollTreeToItem(page, 'Status');
        await page.getByText('Status').click();
        await page.getByText('Save chart').click();
        await expect(page.getByText('Chart name')).toBeVisible();

        await expect(
            page.locator('.mantine-8-Modal-body').locator('button'),
        ).toBeDisabled();
        await page
            .getByTestId('ChartCreateModal/NameInput')
            .fill(`Private chart ${timestamp}`);
        await expect(
            page.getByTestId('ChartCreateModal/NameInput'),
        ).toHaveValue(`Private chart ${timestamp}`);

        // Saves to space by default
        await page
            .locator('.mantine-8-Modal-body')
            .getByRole('button', { name: 'Next' })
            .click();
        await page
            .locator('.mantine-8-Modal-body')
            .getByRole('button', { name: 'Save' })
            .click();

        await expect(page.getByText('Success! Chart was saved.')).toBeVisible();

        // Go back to space using breadcrumbs
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        await page.getByText(`Private space ${timestamp}`).click();

        // Create new dashboard
        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create new dashboard').click();
        await page
            .getByPlaceholder('eg. KPI Dashboard')
            .fill(`Private dashboard ${timestamp}`);
        await page.getByText('Next').click();
        await page.getByText('Create').click();

        // Go back to space using url
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        await page.getByText(`Private space ${timestamp}`).click();

        // Check all items exist in private space
        await page.getByText('All').click();
        await expect(
            page.getByText(`Private dashboard ${timestamp}`),
        ).toBeVisible();
        await expect(
            page.getByText(`Private chart ${timestamp}`),
        ).toBeVisible();
    };

    test('Another non-admin user cannot see private content', async ({
        adminPage: page,
        browser,
    }) => {
        await createPrivateSpace(page);

        // We assume the previous test has been run and the private space has been created
        const spacesResponse = await page.request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
        );
        expect(spacesResponse.status()).toBe(200);
        const spacesBody = await spacesResponse.json();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const privateSpace = spacesBody.results.find(
            (space: any) =>
                space.name.toLowerCase().startsWith('private space') &&
                space.chartCount !== '0' &&
                space.dashboardCount !== '0',
        );
        expect(privateSpace).toBeDefined();

        const spaceResponse = await page.request.get(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces/${privateSpace.uuid}`,
        );
        expect(spaceResponse.status()).toBe(200);
        const spaceBody = await spaceResponse.json();

        const privateChart = spaceBody.results.queries[0];
        const privateDashboard = spaceBody.results.dashboards[0];

        expect(privateChart).toBeDefined();
        expect(privateDashboard).toBeDefined();

        // Create a new user with editor permissions and login
        const email = await loginWithPermissions(page.request, 'member', [
            {
                role: 'editor',
                projectUuid: SEED_PROJECT.project_uuid,
            },
        ]);

        // Create a new browser context for the new user
        const context = await browser.newContext();
        const editorPage = await context.newPage();
        const loginResp = await editorPage.request.post('api/v1/login', {
            data: { email, password: 'test1234' },
        });
        expect(loginResp.status()).toBe(200);

        await editorPage.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        // Select role
        await editorPage.getByPlaceholder('Select your role').click();
        await editorPage.getByText('Product').click();
        await editorPage.getByText('Next').click();

        // Don't show private spaces in navbar
        await editorPage.getByText('Browse').click();
        await expect(editorPage.getByText('Private space')).toHaveCount(0);

        // Don't show private spaces in spaces page
        await editorPage.getByText('All Spaces').click();
        await expect(
            editorPage.getByText(JAFFLE_SHOP_SPACE_NAME),
        ).toBeVisible();
        await expect(editorPage.getByText('Private space')).toHaveCount(0);

        // Navigate to private space and make sure we get a forbidden error
        await editorPage.goto(
            `/projects/${SEED_PROJECT.project_uuid}/spaces/${privateSpace.uuid}`,
        );
        await expect(editorPage.getByText('You need access')).toBeVisible();

        // Navigate to private chart and make sure we get a forbidden error
        await editorPage.goto(
            `/projects/${SEED_PROJECT.project_uuid}/saved/${privateChart.uuid}`,
        );
        await expect(editorPage.getByText('You need access')).toBeVisible();

        // Navigate to private dashboard and make sure we get a forbidden error
        await editorPage.goto(
            `/projects/${SEED_PROJECT.project_uuid}/dashboards/${privateDashboard.uuid}`,
        );
        await expect(editorPage.getByText('You need access')).toBeVisible();

        await context.close();
    });
});

test.describe('Admin access to spaces', () => {
    test('can see all public spaces and private spaces w/ direct access', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of [
            JAFFLE_SHOP_SPACE_NAME,
            ...TREE_1_ROOT_SPACE_NAMES,
        ]) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }
    });

    test.skip('can see all the spaces on Admin content view', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Admin Content View').click();

        for (const spaceName of [
            JAFFLE_SHOP_SPACE_NAME,
            ...TREE_1_ROOT_SPACE_NAMES,
            ...TREE_2_ROOT_SPACE_NAMES,
        ]) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }
    });

    test.skip('can see nested spaces', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Admin Content View').click();

        await page.getByText('Parent Space 4').click();
        await expect(page.getByText('Child Space 4.1')).toBeVisible();
    });

    test('can see all public and private spaces in admin Tree view', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByText('New').click();
        await page
            .getByText('Arrange multiple charts into a single view.')
            .click();
        await page
            .getByPlaceholder('eg. KPI Dashboard')
            .fill(`Test Dashboard ${new Date().toISOString()}`);

        await page.getByTestId('DashboardCreateModal/Next').click();
        for (const spaceName of TREE_1_ROOT_SPACE_NAMES) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }

        await page.getByText('Admin Content View').click();

        for (const spaceName of [
            ...TREE_1_ROOT_SPACE_NAMES,
            ...TREE_2_ROOT_SPACE_NAMES,
        ]) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }

        await page.getByText('Parent Space 4').click();
        await expect(page.getByText('Child Space 4.1')).toBeVisible();
    });
});

test.describe('Editor access to spaces', () => {
    const EDITOR_ROOT_SPACE_NAMES = TREE_2_ROOT_SPACE_NAMES.concat([
        JAFFLE_SHOP_SPACE_NAME,
        'Parent Space 1',
        'Parent Space 3',
        'Parent Space 5',
    ]);

    test('can see all public spaces and private spaces w/ access', async ({
        editorPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of EDITOR_ROOT_SPACE_NAMES) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }

        await expect(page.getByText('Parent Space 2')).toHaveCount(0);
    });

    test('can see nested spaces', async ({ editorPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Parent Space 4').click();
        await expect(page.getByText('Child Space 4.1')).toBeVisible();
    });

    test('can see all public and private spaces w/ access in Tree view', async ({
        editorPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
        await page.getByText('New').click();
        await page
            .getByText('Arrange multiple charts into a single view.')
            .click();
        await page
            .getByPlaceholder('eg. KPI Dashboard')
            .fill(`Test Dashboard ${new Date().toISOString()}`);

        await page.getByTestId('DashboardCreateModal/Next').click();
        for (const spaceName of EDITOR_ROOT_SPACE_NAMES) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }

        await page.getByText('Parent Space 4').click();
        await expect(page.getByText('Child Space 4.1')).toBeVisible();
    });
});

test.describe('Viewer access to spaces', () => {
    const VIEWER_ROOT_SPACE_NAMES = [JAFFLE_SHOP_SPACE_NAME, 'Parent Space 1'];

    test('can see all public spaces and private spaces w/ access', async ({
        viewerPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        for (const spaceName of VIEWER_ROOT_SPACE_NAMES) {
            // eslint-disable-next-line no-await-in-loop
            await expect(page.getByText(spaceName)).toBeVisible();
        }

        await expect(page.getByText('Parent Space 2')).toHaveCount(0);
        await expect(page.getByText('Parent Space 5')).toHaveCount(0);
    });

    test('can see nested spaces', async ({ viewerPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);

        await page.getByText('Parent Space 1').click();
        await expect(page.getByText('Child Space 1.1')).toBeVisible();
        await expect(page.getByText('Child Space 1.2')).toBeVisible();
        await expect(page.getByText('Child Space 1.3')).toBeVisible();
    });
});

test.describe('Editor can create content', () => {
    test('can create a new space', async ({ editorPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        // Parent Space 1/Child Space 1.1
        await page.getByText('Parent Space 1').click();
        await page.getByText('Child Space 1.1').click();

        const spaceName = `TS ${+new Date()}`;

        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create space').click();
        await page.getByPlaceholder('eg. KPIs').fill(spaceName);
        await page.getByRole('button', { name: 'Create' }).click();
        await expect(page.getByText(spaceName)).toBeVisible();

        await page.getByTestId(`ResourceViewActionMenu/${spaceName}`).click();
        await page.getByText('Delete space').click();
        await page.getByPlaceholder('Space name').fill(spaceName);
        await page.getByRole('button', { name: 'Delete' }).click();

        await expect(page.getByText(spaceName)).toHaveCount(0);
    });

    test('can create/delete a new dashboard', async ({ editorPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/spaces`);
        await page.getByText('Parent Space 1').click();
        await page.getByText('Child Space 1.1').click();

        const dashboardName = `TD ${+new Date()}`;

        await page.getByTestId('Space/AddButton').click();
        await page.getByText('Create new dashboard').click();
        await page.getByPlaceholder('eg. KPI Dashboard').fill(dashboardName);
        await page.getByTestId('DashboardCreateModal/Next').click();
        await page.getByRole('button', { name: 'Create' }).click();
        await page.waitForTimeout(1500);
        await page.goBack();
        await page.waitForTimeout(1500);
        await expect(page.getByText(dashboardName)).toBeVisible();

        await page
            .getByTestId(`ResourceViewActionMenu/${dashboardName}`)
            .click();
        await page.getByText('Delete dashboard').click();
        await page.getByRole('button', { name: 'Delete' }).click();
    });
});
