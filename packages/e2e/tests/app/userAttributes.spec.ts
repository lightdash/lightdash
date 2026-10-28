import {
    SEED_PROJECT,
    type ApiUserAttributesResponse,
    type CreateUserAttribute,
    type UserAttribute,
} from '@lightdash/common';
import {
    expect,
    loginWithEmail,
    registerWithCode,
    test,
    verifyEmail,
    withAdminApi,
    type APIRequestContext,
    type Page,
} from '../../support/test';

const apiUrl = '/api/v1';

test.describe.serial('User attributes', () => {
    const email = `user-attributes-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}@lightdash.com`;
    let userUuid: string | null = null;
    const attributeNames = ['customer_id', 'is_admin'];

    const toAttributeBody = (
        attribute: UserAttribute,
    ): CreateUserAttribute => ({
        name: attribute.name,
        description: attribute.description,
        attributeDefaults: attribute.attributeDefaults,
        users: attribute.users.map(({ userUuid: uuid, values }) => ({
            userUuid: uuid,
            values,
        })),
        groups: attribute.groups.map(({ groupUuid, values }) => ({
            groupUuid,
            values,
        })),
    });

    const getAttributes = async (api: APIRequestContext) => {
        const response = await api.get(`${apiUrl}/org/attributes`);
        expect(response.status()).toBe(200);
        return ((await response.json()) as ApiUserAttributesResponse).results;
    };

    const setUserAttribute = async (
        api: APIRequestContext,
        name: string,
        values: string[],
    ) => {
        const attribute = (await getAttributes(api)).find(
            (attr) => attr.name === name,
        );
        expect(attribute, `${name} definition`).toBeDefined();
        expect(typeof userUuid, 'dedicated user').toBe('string');
        const payload = toAttributeBody(attribute!);
        payload.users = payload.users.filter(
            (user) => user.userUuid !== userUuid,
        );
        if (values.length > 0) {
            payload.users.push({ userUuid: userUuid!, values });
        }
        const response = await api.put(
            `${apiUrl}/org/attributes/${attribute!.uuid}`,
            { data: payload },
        );
        expect(response.status()).toBe(201);
    };

    const openAttribute = async (page: Page, name: string) => {
        await page.goto('/generalSettings/userAttributes');
        await page
            .getByRole('row')
            .filter({ has: page.getByText(name, { exact: true }) })
            .getByRole('button')
            .first()
            .click();
        await page.getByText('Edit', { exact: true }).click();
    };

    // The innermost Mantine Group around the user's hidden uuid input.
    const getUserAttributeRow = (page: Page) =>
        page
            .locator('.mantine-Group-root')
            .filter({
                has: page.locator(
                    `input[name$=".userUuid"][value="${userUuid}"]`,
                ),
            })
            .last();

    const saveAttribute = async (page: Page) => {
        await page.getByRole('button', { name: 'Update' }).click();
        await expect(page.getByText('Success').first()).toBeVisible({
            timeout: 10_000,
        });
    };

    const addValueForDedicatedUser = async (page: Page, value: string) => {
        await page.getByText('Add user', { exact: true }).click();
        await page
            .getByPlaceholder('E.g. test@lightdash.com')
            .last()
            .fill(email);
        await page.getByRole('option', { name: email }).click();
        const input = getUserAttributeRow(page).getByPlaceholder(
            'E.g. US (press Enter to add)',
        );
        await input.fill(value);
        await input.press('Enter');
    };

    const replaceValueForDedicatedUser = async (page: Page, value: string) => {
        const row = getUserAttributeRow(page);
        await row.locator('.mantine-Pill-remove').click();
        const input = row.getByPlaceholder('E.g. US (press Enter to add)');
        await input.fill(value);
        await input.press('Enter');
    };

    const openUsersTable = async (page: Page) => {
        await page.goto(`/projects/${SEED_PROJECT.project_uuid}/tables`);
        await page.getByPlaceholder('Search tables').fill('Users');
        await page.getByText('Users', { exact: true }).click();
    };

    test.beforeAll(async ({ playwright }) => {
        await withAdminApi(playwright, async (api) => {
            const inviteResponse = await api.post(`${apiUrl}/invite-links`, {
                data: {
                    email,
                    role: 'admin',
                    expiresAt: new Date(
                        Date.now() + 24 * 60 * 60 * 1000,
                    ).toISOString(),
                },
            });
            expect(inviteResponse.status()).toBe(201);
            const { results } = (await inviteResponse.json()) as {
                results: { userUuid: string; inviteCode: string };
            };
            userUuid = results.userUuid;
            await registerWithCode(api, results.inviteCode);
            await verifyEmail(api);
            await loginWithEmail(api, email);
            const completeResponse = await api.patch(
                `${apiUrl}/user/me/complete`,
                {
                    data: {
                        jobTitle: 'Engineering',
                        enableEmailDomainAccess: false,
                        isMarketingOptedIn: false,
                        isTrackingAnonymized: false,
                    },
                },
            );
            expect(completeResponse.status()).toBe(200);
            for (const name of attributeNames) {
                const attribute = (await getAttributes(api)).find(
                    (attr) => attr.name === name,
                );
                if (attribute) {
                    expect(
                        attribute.attributeDefaults ?? [],
                        `${name} must have no default for missing-value tests`,
                    ).toEqual([]);
                } else {
                    const response = await api.post(
                        `${apiUrl}/org/attributes`,
                        {
                            data: {
                                name,
                                attributeDefaults: null,
                                users: [],
                                groups: [],
                            },
                        },
                    );
                    expect(response.status()).toBe(201);
                }
            }
        });
    });

    test.beforeEach(async ({ api }) => {
        await loginWithEmail(api.raw, email);
    });

    test.afterAll(async ({ playwright }) => {
        const dedicatedUserUuid = userUuid;
        if (!dedicatedUserUuid) return;
        await withAdminApi(playwright, async (api) => {
            for (const name of attributeNames) {
                const attribute = (await getAttributes(api)).find(
                    (attr) => attr.name === name,
                );
                if (attribute) {
                    const payload = toAttributeBody(attribute);
                    payload.users = payload.users.filter(
                        (user) => user.userUuid !== dedicatedUserUuid,
                    );
                    if (payload.users.length !== attribute.users.length) {
                        const response = await api.put(
                            `${apiUrl}/org/attributes/${attribute.uuid}`,
                            { data: payload },
                        );
                        expect(response.status()).toBe(201);
                    }
                }
            }
            const deleteResponse = await api.delete(
                `${apiUrl}/org/user/${dedicatedUserUuid}`,
            );
            expect(deleteResponse.status()).toBe(200);
        });
    });

    test.describe('User attributes sql_filter', () => {
        test.beforeAll(async ({ playwright }) => {
            await withAdminApi(playwright, async (api) => {
                await loginWithEmail(api, email);
                await setUserAttribute(api, 'customer_id', []);
            });
        });

        test('Error on runquery if user attribute has no value', async ({
            page,
        }) => {
            await openUsersTable(page);
            await page.getByText('First name', { exact: true }).click();

            await page
                .getByRole('button', { name: 'Run query' })
                .first()
                .click();

            await expect(
                page.getByText('Error loading results').first(),
            ).toBeVisible();

            await expect(
                page
                    .getByText(
                        'Invalid or missing user attribute "customer_id": "customer_id = $' +
                            '{ld.attr.customer_id}"',
                    )
                    .first(),
            ).toBeVisible();
        });

        test('Add a value for the dedicated user', async ({ page }) => {
            await openAttribute(page, 'customer_id');
            await addValueForDedicatedUser(page, '20');
            await saveAttribute(page);
        });

        test('Should return results with user attribute', async ({ page }) => {
            await openUsersTable(page);
            await page.getByText('First name', { exact: true }).click();

            await page
                .getByRole('button', { name: 'Run query' })
                .first()
                .click();
            await expect(page.getByText('Anna').first()).toBeVisible();
        });

        test('Edit the dedicated user value', async ({ page }) => {
            await openAttribute(page, 'customer_id');
            await replaceValueForDedicatedUser(page, '30');
            await saveAttribute(page);
        });

        test('Should return results with new user attribute', async ({
            page,
        }) => {
            await openUsersTable(page);
            await page.getByText('First name', { exact: true }).click();

            await page
                .getByRole('button', { name: 'Run query' })
                .first()
                .click();
            await expect(page.getByText('Christina').first()).toBeVisible({
                timeout: 30_000,
            });
        });
    });

    test.describe('User attributes dimension required_attribute', () => {
        test.beforeAll(async ({ playwright }) => {
            await withAdminApi(playwright, async (api) => {
                await loginWithEmail(api, email);
                await setUserAttribute(api, 'customer_id', ['30']);
                await setUserAttribute(api, 'is_admin', []);
            });
        });

        test('Should not see last_name dimension', async ({ page }) => {
            await openUsersTable(page);
            await expect(
                page.getByText('Last name', { exact: true }),
            ).toHaveCount(0);
        });

        test('Add a value for the dedicated user', async ({ page }) => {
            await openAttribute(page, 'is_admin');
            await addValueForDedicatedUser(page, 'true');
            await saveAttribute(page);
        });

        test('Should see last_name attribute', async ({ page }) => {
            await openUsersTable(page);
            await page.getByText('Last name', { exact: true }).click();

            await page
                .getByRole('button', { name: 'Run query' })
                .first()
                .click();
            await expect(page.getByText('W.').first()).toBeVisible({
                timeout: 30_000,
            });
        });

        test('Edit the dedicated user value', async ({ page }) => {
            await openAttribute(page, 'is_admin');
            await replaceValueForDedicatedUser(page, 'false');
            await saveAttribute(page);
        });

        // Renamed from a duplicate title, which Playwright rejects within one describe.
        test('Should not see last_name dimension after removing access', async ({
            page,
        }) => {
            await openUsersTable(page);
            await expect(
                page.getByText('Last name', { exact: true }),
            ).toHaveCount(0);
        });
    });
});
