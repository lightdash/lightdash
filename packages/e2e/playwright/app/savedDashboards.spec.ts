import { SEED_PROJECT } from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type Locator,
    type Page,
    type Response,
} from '@playwright/test';
import { randomUUID } from 'node:crypto';

const dashboardListPath = `/projects/${SEED_PROJECT.project_uuid}/dashboards`;
const createDashboardApiPath = `/api/v1/projects/${SEED_PROJECT.project_uuid}/dashboards`;
const dashboardApiPath = (dashboardUuid: string) =>
    `/api/v2/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}`;
const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const parseObject = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Expected an object response');
    }

    return Object.fromEntries(Object.entries(value));
};

const parseCreatedDashboardUuid = async (response: Response) => {
    const body: unknown = await response.json();
    const parsedBody = parseObject(body);

    if (parsedBody.status !== 'ok') {
        throw new Error('Expected a successful dashboard response');
    }

    const dashboard = parseObject(parsedBody.results);
    const { uuid } = dashboard;
    if (typeof uuid !== 'string' || !uuidPattern.test(uuid)) {
        throw new Error('Expected the created dashboard to have a UUID');
    }

    return uuid;
};

const getDashboardRow = (page: Page, name: string): Locator =>
    page
        .getByRole('row')
        .filter({ has: page.getByText(name, { exact: true }) });

const getDialog = (page: Page, title: string): Locator =>
    page
        .getByRole('dialog')
        .filter({ has: page.getByText(title, { exact: true }) });

const waitForDashboardMutation = (
    page: Page,
    method: 'POST' | 'PATCH' | 'DELETE',
    path: string,
) =>
    page.waitForResponse(
        (response) =>
            response.request().method() === method &&
            new URL(response.url()).pathname === path,
    );

const cleanupDashboard = async (
    request: APIRequestContext,
    dashboardUuid: string,
) => {
    const response = await request.delete(dashboardApiPath(dashboardUuid));
    const status = response.status();

    if (status !== 200 && status !== 404) {
        throw new Error(`Dashboard cleanup failed with status ${status}`);
    }

    const verificationResponse = await request.get(
        dashboardApiPath(dashboardUuid),
    );
    if (verificationResponse.status() !== 404) {
        throw new Error(
            `Dashboard cleanup verification failed with status ${verificationResponse.status()}`,
        );
    }
};

const toError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error));

test.describe('Dashboard list', { tag: '@mutating' }, () => {
    test('admin can create, rename, and delete a dashboard', async ({
        page,
        request,
    }, testInfo) => {
        const runId = randomUUID();
        const createdName = `Playwright dashboard ${runId}`;
        const renamedName = `${createdName} renamed`;
        let dashboardUuid: string | null = null;
        let testError: Error | null = null;
        let cleanupError: Error | null = null;

        try {
            await page.goto(`/projects/${SEED_PROJECT.project_uuid}/home`);
            await page.getByRole('button', { name: 'Browse' }).click();
            await page
                .getByRole('menuitem', {
                    name: 'All dashboards',
                    exact: true,
                })
                .click();
            await expect(page).toHaveURL(dashboardListPath);
            await expect(
                getDashboardRow(page, 'Jaffle dashboard').first(),
            ).toBeVisible();

            await page
                .getByRole('button', {
                    name: 'Create dashboard',
                    exact: true,
                })
                .click();
            const createDialog = getDialog(page, 'Create Dashboard');
            await expect(createDialog).toBeVisible();
            await createDialog
                .getByLabel('Name your dashboard', { exact: false })
                .fill(createdName);
            await createDialog
                .getByLabel('Dashboard description', { exact: true })
                .fill('Description');
            await createDialog
                .getByRole('button', { name: 'Next', exact: true })
                .click();

            const createButton = createDialog.getByRole('button', {
                name: 'Create',
                exact: true,
            });
            await expect(createButton).toBeEnabled();
            const createResponsePromise = waitForDashboardMutation(
                page,
                'POST',
                createDashboardApiPath,
            );
            await createButton.click();
            const createResponse = await createResponsePromise;
            expect(createResponse.status()).toBe(201);
            dashboardUuid = await parseCreatedDashboardUuid(createResponse);

            await expect(page).toHaveURL(
                `/projects/${SEED_PROJECT.project_uuid}/dashboards/${dashboardUuid}/edit`,
            );
            await expect(
                page.getByRole('heading', {
                    name: createdName,
                    exact: true,
                }),
            ).toBeVisible();

            await page.goto(dashboardListPath);
            const createdRow = getDashboardRow(page, createdName);
            await expect(createdRow).toHaveCount(1);
            await expect(createdRow).toBeVisible();
            await createdRow
                .getByRole('button', { name: 'Menu', exact: true })
                .click();
            await page
                .getByRole('menuitem', { name: 'Rename', exact: true })
                .click();

            const updateDialog = getDialog(page, 'Update Dashboard');
            await expect(updateDialog).toBeVisible();
            await updateDialog
                .getByLabel('Name', { exact: false })
                .fill(renamedName);
            const updateResponsePromise = waitForDashboardMutation(
                page,
                'PATCH',
                dashboardApiPath(dashboardUuid),
            );
            await updateDialog
                .getByRole('button', { name: 'Save', exact: true })
                .click();
            const updateResponse = await updateResponsePromise;
            expect(updateResponse.status()).toBe(200);
            await expect(updateDialog).not.toBeVisible();
            await expect(createdRow).toHaveCount(0);

            const renamedRow = getDashboardRow(page, renamedName);
            await expect(renamedRow).toHaveCount(1);
            await expect(renamedRow).toBeVisible();
            await renamedRow
                .getByRole('button', { name: 'Menu', exact: true })
                .click();
            await page
                .getByRole('menuitem', {
                    name: 'Delete dashboard',
                    exact: true,
                })
                .click();

            const deleteDialog = getDialog(page, 'Delete dashboard');
            await expect(deleteDialog).toBeVisible();
            const deleteResponsePromise = waitForDashboardMutation(
                page,
                'DELETE',
                dashboardApiPath(dashboardUuid),
            );
            await deleteDialog
                .getByRole('button', { name: 'Delete', exact: true })
                .click();
            const deleteResponse = await deleteResponsePromise;
            expect(deleteResponse.status()).toBe(200);
            await expect(deleteDialog).not.toBeVisible();
            await expect(renamedRow).toHaveCount(0);
        } catch (error: unknown) {
            testError = toError(error);
        } finally {
            if (dashboardUuid !== null) {
                try {
                    await cleanupDashboard(request, dashboardUuid);
                } catch (error: unknown) {
                    cleanupError = toError(error);
                }
            }
        }

        if (testError !== null) {
            if (cleanupError !== null) {
                await testInfo.attach('dashboard cleanup failure', {
                    body: cleanupError.stack ?? cleanupError.message,
                    contentType: 'text/plain',
                });
            }
            throw testError;
        }

        if (cleanupError !== null) {
            throw cleanupError;
        }
    });
});
