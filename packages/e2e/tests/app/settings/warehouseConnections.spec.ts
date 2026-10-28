import {
    expect,
    loginAs,
    SEED_USERS,
    test,
    TrackedApi,
    type Page,
} from '../../../support/test';

// Traces record request bodies, and these tests type warehouse credentials
test.use({ trace: 'off' });

const CREDENTIALS_NAME = 'Athena test';
const UPDATED_CREDENTIALS_NAME = `${CREDENTIALS_NAME} updated`;

type WarehouseCredentialsResponse = {
    status: 'ok';
    results: {
        uuid: string;
        name: string;
        credentials: {
            type: string;
            accessKeyId?: string;
            secretAccessKey?: string;
        };
    }[];
};

const openCredentialsMenu = async (page: Page, name: string) => {
    const row = page.getByRole('row', {
        name: `${name} Athena All projects`,
        exact: true,
    });
    await expect(row).toBeVisible();
    await row.getByRole('button').click();
};

const getCredentials = async (api: TrackedApi) => {
    const response = await api.get('/api/v1/user/warehouseCredentials');
    expect(response.status()).toBe(200);
    const body = (await response.json()) as WarehouseCredentialsResponse;
    return body.results;
};

const cleanupTestCredentials = async (api: TrackedApi) => {
    const testCredentials = (await getCredentials(api)).filter(({ name }) =>
        [CREDENTIALS_NAME, UPDATED_CREDENTIALS_NAME].includes(name),
    );
    for (const { uuid } of testCredentials) {
        await api.delete(`/api/v1/user/warehouseCredentials/${uuid}`);
    }
};

test.describe('Settings - Warehouse connections', () => {
    test.beforeEach(async ({ api }) => {
        await loginAs(api.raw, SEED_USERS.admin);
        await cleanupTestCredentials(api);
    });

    test.afterEach(async ({ api }) => {
        await cleanupTestCredentials(api);
    });

    test('creates and edits Athena personal credentials', async ({
        page,
        api,
    }) => {
        await page.goto('/generalSettings/myWarehouseConnections');
        await page.getByRole('button', { name: 'Add credentials' }).click();

        const dialog = page.getByRole('dialog');
        await dialog
            .getByRole('textbox', { name: 'Name', exact: true })
            .fill(CREDENTIALS_NAME);
        await dialog.getByRole('combobox', { name: 'Warehouse' }).click();
        await page.getByRole('option', { name: 'Athena', exact: true }).click();

        const accessKeyInput = dialog.getByRole('textbox', {
            name: 'AWS access key ID',
        });
        const secretKeyInput = dialog.getByLabel(/AWS secret access key/);
        await expect(accessKeyInput).toBeVisible();
        await accessKeyInput.fill('dummy-athena-access-key');
        await expect(secretKeyInput).toBeVisible();
        await secretKeyInput.fill('dummy-athena-secret-key');
        await dialog.getByRole('button', { name: 'Save' }).click();

        await expect(
            page.getByText('Success! Warehouse connection was created.'),
        ).toBeVisible();
        await openCredentialsMenu(page, CREDENTIALS_NAME);

        await page.getByRole('menuitem', { name: 'Edit' }).click();
        const nameInput = dialog.getByRole('textbox', {
            name: 'Name',
            exact: true,
        });
        await expect(nameInput).toHaveValue(CREDENTIALS_NAME);
        await nameInput.fill(UPDATED_CREDENTIALS_NAME);
        await expect(accessKeyInput).toHaveValue('dummy-athena-access-key');
        await expect(secretKeyInput).toHaveValue('');
        await expect(
            dialog.getByText(
                'Leave blank to keep the current secret access key.',
            ),
        ).toBeVisible();
        await dialog.getByRole('button', { name: 'Save' }).click();

        await expect(
            page.getByText('Success! Warehouse connection was updated.'),
        ).toBeVisible();
        await expect(
            page.getByRole('row', {
                name: `${UPDATED_CREDENTIALS_NAME} Athena All projects`,
                exact: true,
            }),
        ).toBeVisible();

        await openCredentialsMenu(page, UPDATED_CREDENTIALS_NAME);
        await page.getByRole('menuitem', { name: 'Edit' }).click();
        await expect(accessKeyInput).toHaveValue('dummy-athena-access-key');
        await accessKeyInput.fill('updated-dummy-athena-access-key');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(
            dialog.getByText(
                'Enter the AWS secret access key for this access key ID.',
            ),
        ).toBeVisible();
        await secretKeyInput.fill('updated-dummy-athena-secret-key');
        const updateResponse = page.waitForResponse(
            (response) =>
                response.request().method() === 'PATCH' &&
                response.url().includes('/api/v1/user/warehouseCredentials/'),
        );
        await dialog.getByRole('button', { name: 'Save' }).click();
        await updateResponse;

        await expect(
            page.getByText('Success! Warehouse connection was updated.'),
        ).toBeVisible();
        const updated = (await getCredentials(api)).find(
            ({ name }) => name === UPDATED_CREDENTIALS_NAME,
        );
        expect(updated?.credentials).toEqual({
            type: 'athena',
            accessKeyId: 'updated-dummy-athena-access-key',
        });
    });
});
