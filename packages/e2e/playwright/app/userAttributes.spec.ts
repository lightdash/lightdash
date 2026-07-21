import {
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_PROJECT,
} from '@lightdash/common';
import {
    expect,
    test,
    type APIRequestContext,
    type APIResponse,
    type Page,
    type Response,
    type TestInfo,
} from '@playwright/test';

const attributesApiPath = '/api/v1/org/attributes';
const settingsPath = '/generalSettings/userAttributes';
const missingCustomerIdMessage =
    // eslint-disable-next-line no-template-curly-in-string
    'Missing user attribute "customer_id": "customer_id = ${ld.attr.customer_id}"';

type AttributeSummary = {
    uuid: string;
    name: string;
};

const parseObject = (value: unknown): Record<string, unknown> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('Expected an object response');
    }

    return Object.fromEntries(Object.entries(value));
};

const parseAttributeSummary = (value: unknown): AttributeSummary => {
    const attribute = parseObject(value);
    const { name, uuid } = attribute;

    if (typeof name !== 'string' || typeof uuid !== 'string') {
        throw new Error('Expected a user attribute with a name and UUID');
    }

    return { name, uuid };
};

const parseSuccessBody = (body: unknown) => {
    const parsedBody = parseObject(body);

    if (parsedBody.status !== 'ok') {
        throw new Error('Expected a successful API response');
    }

    return parsedBody;
};

const parseApiSuccessBody = async (response: APIResponse) => {
    const body: unknown = await response.json();
    return parseSuccessBody(body);
};

const parseBrowserSuccessBody = async (response: Response) => {
    const body: unknown = await response.json();
    return parseSuccessBody(body);
};

const listAttributes = async (request: APIRequestContext) => {
    const response = await request.get(attributesApiPath);
    expect(response.status()).toBe(200);

    const body = await parseApiSuccessBody(response);
    if (!Array.isArray(body.results)) {
        throw new Error('Expected a user attribute list');
    }

    return body.results.map(parseAttributeSummary);
};

const findExactAttribute = async (
    request: APIRequestContext,
    name: string,
): Promise<AttributeSummary | null> => {
    const matches = (await listAttributes(request)).filter(
        (attribute) => attribute.name === name,
    );
    expect(matches.length).toBeLessThanOrEqual(1);

    return matches[0] ?? null;
};

const deleteAttributeByUuid = async (
    request: APIRequestContext,
    uuid: string,
    allowAlreadyAbsent = false,
) => {
    const response = await request.delete(`${attributesApiPath}/${uuid}`);

    if (allowAlreadyAbsent && response.status() === 404) {
        return;
    }

    expect(response.status()).toBe(200);
    await parseApiSuccessBody(response);
};

const deleteExactAttributeIfPresent = async (
    request: APIRequestContext,
    name: string,
) => {
    const attribute = await findExactAttribute(request, name);
    if (attribute !== null) {
        await deleteAttributeByUuid(request, attribute.uuid);
    }
};

const toError = (error: unknown) =>
    error instanceof Error ? error : new Error(String(error));

const withExactAttributeCleanup = async (
    request: APIRequestContext,
    testInfo: TestInfo,
    name: string,
    run: (registerCreatedUuid: (uuid: string) => void) => Promise<void>,
) => {
    let createdUuid: string | null = null;
    let testError: Error | null = null;
    let cleanupError: Error | null = null;

    try {
        await deleteExactAttributeIfPresent(request, name);
        await run((uuid) => {
            createdUuid = uuid;
        });
    } catch (error: unknown) {
        testError = toError(error);
    } finally {
        try {
            const attribute =
                createdUuid === null
                    ? await findExactAttribute(request, name)
                    : { name, uuid: createdUuid };
            if (attribute !== null) {
                await deleteAttributeByUuid(request, attribute.uuid, true);
            }
            expect(await findExactAttribute(request, name)).toBeNull();
        } catch (error: unknown) {
            cleanupError = toError(error);
        }
    }

    if (testError !== null) {
        if (cleanupError !== null) {
            await testInfo.attach('user attribute cleanup failure', {
                body: cleanupError.stack ?? cleanupError.message,
                contentType: 'text/plain',
            });
        }
        throw testError;
    }

    if (cleanupError !== null) {
        throw cleanupError;
    }
};

const waitForAttributeMutation = (
    page: Page,
    method: 'POST' | 'PUT',
    uuid: string | null,
) =>
    page.waitForResponse((response) => {
        const expectedPath =
            uuid === null ? attributesApiPath : `${attributesApiPath}/${uuid}`;
        return (
            new URL(response.url()).pathname === expectedPath &&
            response.request().method() === method
        );
    });

const parseMutationResponse = async (response: Response) => {
    expect(response.status()).toBe(201);
    const body = await parseBrowserSuccessBody(response);
    return parseAttributeSummary(body.results);
};

const addAttributeThroughUi = async (
    page: Page,
    name: string,
    value: string,
) => {
    await page.goto(settingsPath, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Add new attribute' }).click();

    const modal = page.getByRole('dialog', {
        name: 'Add user attribute',
        exact: true,
    });
    await expect(modal).toBeVisible();
    await modal.getByRole('textbox', { name: 'Attribute name' }).fill(name);
    await modal.getByRole('button', { name: 'Add user', exact: true }).click();
    await modal.getByLabel('User email').fill('demo');
    await page
        .getByRole('option', {
            name: SEED_ORG_1_ADMIN_EMAIL.email,
            exact: true,
        })
        .click();
    await modal.getByLabel('Values').fill(value);
    await modal.getByLabel('Values').press('Enter');

    const responsePromise = waitForAttributeMutation(page, 'POST', null);
    await modal.getByRole('button', { name: 'Add', exact: true }).click();
    const response = await responsePromise;
    const attribute = await parseMutationResponse(response);

    expect(response.request().postDataJSON()).toEqual({
        name,
        attributeDefaults: null,
        users: [{ userUuid: SEED_ORG_1_ADMIN.user_uuid, values: [value] }],
        groups: [],
    });
    expect(attribute.name).toBe(name);
    await expect(
        page.getByText('Success! user attribute was created.', { exact: true }),
    ).toBeVisible();

    return attribute.uuid;
};

const editAttributeThroughUi = async (
    page: Page,
    name: string,
    uuid: string,
    oldValue: string,
    newValue: string,
) => {
    await page.goto(settingsPath, { waitUntil: 'domcontentloaded' });
    const row = page
        .getByRole('row')
        .filter({ has: page.getByText(name, { exact: true }) });
    await expect(row).toHaveCount(1);
    await row
        .getByRole('button', {
            name: `Actions for ${name}`,
            exact: true,
        })
        .click();
    await page.getByRole('menuitem', { name: 'Edit', exact: true }).click();

    const modal = page.getByRole('dialog', {
        name: 'Update user attribute',
        exact: true,
    });
    await expect(modal).toBeVisible();
    const valuesInput = modal.getByLabel('Values');
    await expect(modal.getByText(oldValue, { exact: true })).toBeVisible();
    await valuesInput.press('Backspace');
    await expect(modal.getByText(oldValue, { exact: true })).toHaveCount(0);
    await valuesInput.fill(newValue);
    await valuesInput.press('Enter');

    const responsePromise = waitForAttributeMutation(page, 'PUT', uuid);
    await modal.getByRole('button', { name: 'Update', exact: true }).click();
    const response = await responsePromise;
    const attribute = await parseMutationResponse(response);

    expect(response.request().postDataJSON()).toEqual({
        name,
        attributeDefaults: null,
        users: [
            {
                userUuid: SEED_ORG_1_ADMIN.user_uuid,
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                values: [newValue],
                value: oldValue,
            },
        ],
        groups: [],
    });
    expect(attribute).toEqual({ name, uuid });
    await expect(
        page.getByText('Success! user attribute was updated.', { exact: true }),
    ).toBeVisible();
};

const openExplore = async (page: Page, label: 'Customers' | 'Users') => {
    await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`, {
        waitUntil: 'domcontentloaded',
    });
    await page.getByPlaceholder('Search tables').fill(label);
    const explore = page
        .getByRole('listitem')
        .filter({ has: page.getByText(label, { exact: true }) });
    await expect(explore).toHaveCount(1);
    await explore.getByText(label, { exact: true }).click();
    await expect(page).toHaveURL(
        `/projects/${SEED_PROJECT.project_uuid}/tables/${label.toLowerCase()}`,
    );
    await expect(
        page.getByPlaceholder('Search metrics + dimensions'),
    ).toBeVisible();
    const fieldTree = page.getByTestId('virtualized-tree-scroll-container');
    await expect(fieldTree).toBeVisible();
    await expect(
        fieldTree.getByText('Customer id', { exact: true }),
    ).toBeVisible();
};

const selectField = async (page: Page, label: string) => {
    const fieldTree = page.getByTestId('virtualized-tree-scroll-container');
    const search = page.getByPlaceholder('Search metrics + dimensions');
    await search.fill(label);
    await expect(
        fieldTree.getByText('Customer id', { exact: true }),
    ).not.toBeVisible();
    const field = fieldTree.getByText(label, { exact: true });
    await expect(field).toBeVisible();
    await field.click();
};

const expectFieldAbsent = async (page: Page, label: string) => {
    const fieldTree = page.getByTestId('virtualized-tree-scroll-container');
    const search = page.getByPlaceholder('Search metrics + dimensions');
    await search.fill(label);
    await expect(
        fieldTree.getByText('Customer id', { exact: true }),
    ).not.toBeVisible();
    await expect(fieldTree.getByText(label, { exact: true })).toHaveCount(0);
};

const runQuery = async (page: Page, expectedStatus: 200 | 403) => {
    const responsePromise = page.waitForResponse(
        (response) =>
            response.request().method() === 'POST' &&
            new URL(response.url()).pathname ===
                `/api/v2/projects/${SEED_PROJECT.project_uuid}/query/metric-query`,
    );
    const results = page.getByTestId('results-table-container');
    const runQueryButton = page
        .getByTestId('ExplorerHeader')
        .getByTestId('RefreshButton/RunQueryButton');
    await expect(runQueryButton).toHaveCount(1);
    const [, response] = await Promise.all([
        runQueryButton.click(),
        responsePromise,
    ]);
    expect(response.status()).toBe(expectedStatus);
    return results;
};

test.describe('user attributes', { tag: '@mutating' }, () => {
    test.beforeEach(async ({ page }) => {
        await page.route('https://cdn.headwayapp.co/widget.js', (route) =>
            route.abort(),
        );
    });
    test('customer_id controls SQL filter query results', async ({
        page,
        request,
    }, testInfo) => {
        test.setTimeout(90_000);

        await withExactAttributeCleanup(
            request,
            testInfo,
            'customer_id',
            async (registerCreatedUuid) => {
                await openExplore(page, 'Users');
                await selectField(page, 'First name');
                const missingResults = await runQuery(page, 403);
                await expect(
                    missingResults.getByText('Error loading results', {
                        exact: true,
                    }),
                ).toBeVisible({ timeout: 30_000 });
                await expect(
                    missingResults.getByText(missingCustomerIdMessage, {
                        exact: true,
                    }),
                ).toBeVisible();

                const uuid = await addAttributeThroughUi(
                    page,
                    'customer_id',
                    '20',
                );
                registerCreatedUuid(uuid);

                await openExplore(page, 'Users');
                await selectField(page, 'First name');
                const initialResults = await runQuery(page, 200);
                await expect(
                    initialResults.getByText('Anna', { exact: true }),
                ).toBeVisible({ timeout: 30_000 });

                await editAttributeThroughUi(
                    page,
                    'customer_id',
                    uuid,
                    '20',
                    '30',
                );
                await openExplore(page, 'Users');
                await selectField(page, 'First name');
                const updatedResults = await runQuery(page, 200);
                await expect(
                    updatedResults.getByText('Christina', { exact: true }),
                ).toBeVisible({ timeout: 30_000 });
            },
        );
    });

    test('is_admin controls access to Customers age', async ({
        page,
        request,
    }, testInfo) => {
        test.setTimeout(90_000);

        await withExactAttributeCleanup(
            request,
            testInfo,
            'is_admin',
            async (registerCreatedUuid) => {
                await openExplore(page, 'Customers');
                await expectFieldAbsent(page, 'Age');

                const uuid = await addAttributeThroughUi(
                    page,
                    'is_admin',
                    'true',
                );
                registerCreatedUuid(uuid);

                await openExplore(page, 'Customers');
                await selectField(page, 'Age');
                const results = await runQuery(page, 200);
                await expect(
                    results.getByText('Age', { exact: true }),
                ).toBeVisible({ timeout: 30_000 });
                await expect(
                    results.getByRole('cell', { name: '30', exact: true }),
                ).not.toHaveCount(0);

                await editAttributeThroughUi(
                    page,
                    'is_admin',
                    uuid,
                    'true',
                    'false',
                );
                await openExplore(page, 'Customers');
                await expectFieldAbsent(page, 'Age');
            },
        );
    });
});
