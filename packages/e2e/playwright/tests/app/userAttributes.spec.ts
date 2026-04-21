import { SEED_PROJECT } from '@lightdash/common';
import { expect, test } from '../../fixtures';

const apiUrl = '/api/v1';

// todo: just have 1 test to cover list/create/edit/delete and don't run queries
test.describe('User attributes sql_filter', () => {
    test('Delete customer_id attribute', async ({ adminPage: page }) => {
        const resp = await page.request.get(`${apiUrl}/org/attributes`);
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        const customerIdAttr = body.results.find(
            (attr: { name: string }) => attr.name === 'customer_id',
        );
        if (customerIdAttr) {
            const deleteResp = await page.request.delete(
                `${apiUrl}/org/attributes/${customerIdAttr.uuid}`,
            );
            expect(deleteResp.status()).toBe(200);
        }
    });

    test('Error on runquery if user attribute does not exist', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users').click();
        await page.getByText('First name').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();

        await expect(page.getByText('Error loading results')).toBeVisible();

        const expectedMessage =
            // eslint-disable-next-line no-template-curly-in-string
            'Missing user attribute "customer_id": "customer_id = ${ld.attr.customer_id}"';
        await expect(page.getByText(expectedMessage)).toBeVisible();
    });

    test('Create user attribute', async ({ adminPage: page }) => {
        await page.goto(`/generalSettings/userAttributes`);
        await page.getByText('Add new attribute').click();

        await page.locator('input[name="name"]').fill('customer_id');
        await page.getByRole('button', { name: 'Add user' }).click();
        await page.getByPlaceholder('E.g. test@lightdash.com').fill('demo');
        await page.getByText('demo@lightdash.com').click();
        await page.locator('input[name="users.0.value"]').fill('20');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
    });

    test('Should return results with user attribute', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users').click();
        await page.getByText('First name').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('Anna')).toBeVisible();
    });

    test('Edit user attribute', async ({ adminPage: page }) => {
        await page.goto(`/generalSettings/userAttributes`);

        const row = page.getByText('customer_id').locator('xpath=ancestor::tr');
        await row.locator('button').first().click();
        await page.getByText('Edit').click();
        await page.locator('input[name="users.0.value"]').clear();
        await page.locator('input[name="users.0.value"]').fill('30');
        await page.getByRole('button', { name: 'Update' }).click();
        await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
    });

    test('Should return results with new user attribute', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users').click();
        await page.getByText('First name').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('Christina')).toBeVisible({
            timeout: 30000,
        });
    });
});

// todo: combine into 1 test
test.describe('User attributes dimension required_attribute', () => {
    test('Create customer_id attribute', async ({ adminPage: page }) => {
        // This could fail if the attribute already exists
        await page.request.post(`${apiUrl}/org/attributes`, {
            headers: { 'Content-type': 'application/json' },
            data: {
                name: 'customer_id',
                users: [
                    {
                        userUuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
                        value: '30',
                    },
                ],
                attributeDefault: undefined,
            },
            failOnStatusCode: false,
        });
    });

    test('Delete is_admin attribute', async ({ adminPage: page }) => {
        const resp = await page.request.get(`${apiUrl}/org/attributes`);
        expect(resp.status()).toBe(200);
        const body = await resp.json();
        const isAdminAttr = body.results.find(
            (attr: { name: string }) => attr.name === 'is_admin',
        );
        if (isAdminAttr) {
            const deleteResp = await page.request.delete(
                `${apiUrl}/org/attributes/${isAdminAttr.uuid}`,
            );
            expect(deleteResp.status()).toBe(200);
        }
    });

    test('Should not see last_name dimension before attribute is set', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users').click();
        await expect(page.getByText('Last name')).toHaveCount(0);
    });

    test('Create user attribute', async ({ adminPage: page }) => {
        await page.goto(`/generalSettings/userAttributes`);
        await page.getByText('Add new attribute').click();

        await page.locator('input[name="name"]').fill('is_admin');
        await page.getByRole('button', { name: 'Add user' }).click();
        await page.getByPlaceholder('E.g. test@lightdash.com').fill('demo');
        await page.getByText('demo@lightdash.com').click();
        await page.locator('input[name="users.0.value"]').fill('true');
        await page.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
    });

    test('Should see last_name attribute', async ({ adminPage: page }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users').click();
        await page.getByText('Last name').click();

        // run query
        await page.getByRole('button', { name: 'Run query' }).first().click();
        await expect(page.getByText('W.')).toBeVisible({ timeout: 30000 });
    });

    test('Edit user attribute', async ({ adminPage: page }) => {
        await page.goto(`/generalSettings/userAttributes`);

        const row = page.getByText('is_admin').locator('xpath=ancestor::tr');
        await row.locator('button').first().click();
        await page.getByText('Edit').click();
        await page.locator('input[name="users.0.value"]').clear();
        await page.locator('input[name="users.0.value"]').fill('false');
        await page.getByRole('button', { name: 'Update' }).click();
        await expect(page.getByText('Success')).toBeVisible({ timeout: 10000 });
    });

    test('Should not see last_name dimension after attribute is changed', async ({
        adminPage: page,
    }) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);

        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users').click();
        await expect(page.getByText('Last name')).toHaveCount(0);
    });
});
