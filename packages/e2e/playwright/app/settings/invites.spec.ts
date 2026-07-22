import {
    SEED_ORG_1_ADMIN,
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import {
    expect,
    request as playwrightRequest,
    test,
    type APIRequestContext,
    type Page,
    type Response,
} from '@playwright/test';
import { randomUUID } from 'crypto';
import adminAuthenticationFile from '../../auth';

const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const inviteePassword = 'PasswordMary1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const getRecord = (value: unknown, path: string) => {
    if (!isRecord(value)) {
        throw new Error(`${path} must be an object`);
    }
    return value;
};

const getString = (
    value: Record<string, unknown>,
    key: string,
    path: string,
) => {
    const property = value[key];
    if (typeof property !== 'string') {
        throw new Error(`${path}.${key} must be a string`);
    }
    return property;
};

const getBoolean = (
    value: Record<string, unknown>,
    key: string,
    path: string,
) => {
    const property = value[key];
    if (typeof property !== 'boolean') {
        throw new Error(`${path}.${key} must be a boolean`);
    }
    return property;
};

const getNumber = (
    value: Record<string, unknown>,
    key: string,
    path: string,
) => {
    const property = value[key];
    if (typeof property !== 'number' || !Number.isFinite(property)) {
        throw new Error(`${path}.${key} must be a finite number`);
    }
    return property;
};

const getUuid = (value: Record<string, unknown>, key: string, path: string) => {
    const uuid = getString(value, key, path);
    if (!uuidPattern.test(uuid)) {
        throw new Error(`${path}.${key} must be a UUID`);
    }
    return uuid;
};

const parseResponseJson = (body: string, label: string) => {
    try {
        const parsed: unknown = JSON.parse(body);
        return parsed;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`${label} returned invalid JSON: ${message}`);
    }
};

const parseOkPayload = (body: string, label: string) => {
    const payload = getRecord(parseResponseJson(body, label), label);
    const status = getString(payload, 'status', label);
    if (status !== 'ok') {
        throw new Error(`${label}.status must be "ok"`);
    }
    return payload;
};

const parseOkResults = (body: string, label: string) => {
    const payload = parseOkPayload(body, label);
    return getRecord(payload.results, `${label}.results`);
};

const assertResponseStatus = (
    actualStatus: number,
    expectedStatus: number,
    label: string,
) => {
    if (actualStatus !== expectedStatus) {
        throw new Error(
            `${label} returned ${actualStatus}, expected ${expectedStatus}`,
        );
    }
};

const parseInviteResponse = (body: string, expectedEmail: string) => {
    const results = parseOkResults(body, 'invite response');
    const inviteCode = getString(results, 'inviteCode', 'invite.results');
    const inviteUrl = getString(results, 'inviteUrl', 'invite.results');
    const expiresAt = getString(results, 'expiresAt', 'invite.results');
    const organizationUuid = getUuid(
        results,
        'organizationUuid',
        'invite.results',
    );
    const userUuid = getUuid(results, 'userUuid', 'invite.results');
    const email = getString(results, 'email', 'invite.results');

    if (inviteCode.length === 0) {
        throw new Error('invite.results.inviteCode must not be empty');
    }
    if (Number.isNaN(Date.parse(expiresAt))) {
        throw new Error('invite.results.expiresAt must be a date');
    }
    try {
        const url = new URL(inviteUrl);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
            throw new Error('unsupported invite URL protocol');
        }
    } catch {
        throw new Error('invite.results.inviteUrl must be an absolute URL');
    }
    if (email !== expectedEmail) {
        throw new Error(`Invite response email did not match ${expectedEmail}`);
    }

    return {
        email,
        expiresAt,
        inviteCode,
        inviteUrl,
        organizationUuid,
        userUuid,
    };
};

const parseRegisteredUserResponse = (body: string, expectedEmail: string) => {
    const results = parseOkResults(body, 'registration response');
    const userUuid = getUuid(results, 'userUuid', 'registration.results');
    const email = getString(results, 'email', 'registration.results');
    const firstName = getString(results, 'firstName', 'registration.results');
    const lastName = getString(results, 'lastName', 'registration.results');

    if (email !== expectedEmail) {
        throw new Error(
            `Registration response email did not match ${expectedEmail}`,
        );
    }

    return { email, firstName, lastName, userUuid };
};

const parseEmailStatusResponse = (body: string) => {
    const results = parseOkResults(body, 'email status response');
    return {
        email: getString(results, 'email', 'emailStatus.results'),
        isVerified: getBoolean(results, 'isVerified', 'emailStatus.results'),
    };
};

const parseSchedulersSummaryResponse = (body: string) => {
    const results = parseOkResults(body, 'schedulers summary response');
    const totalCount = getNumber(
        results,
        'totalCount',
        'schedulersSummary.results',
    );
    const hasGsheetsSchedulers = getBoolean(
        results,
        'hasGsheetsSchedulers',
        'schedulersSummary.results',
    );
    if (!Array.isArray(results.byProject)) {
        throw new Error('schedulersSummary.results.byProject must be an array');
    }
    if (!Number.isInteger(totalCount) || totalCount < 0) {
        throw new Error(
            'schedulersSummary.results.totalCount must be a non-negative integer',
        );
    }
    return { hasGsheetsSchedulers, totalCount };
};

const parseOrganizationUsersResponse = (body: string) => {
    const results = parseOkResults(body, 'organization users response');
    if (!Array.isArray(results.data)) {
        throw new Error('organizationUsers.results.data must be an array');
    }

    return results.data.map((profile, index) => {
        const path = `organizationUsers.results.data[${index}]`;
        const record = getRecord(profile, path);
        return {
            email: getString(record, 'email', path),
            userUuid: getUuid(record, 'userUuid', path),
        };
    });
};

const getExactUserUuid = (body: string, email: string) => {
    const profiles = parseOrganizationUsersResponse(body);
    const matches = profiles.filter((profile) => profile.email === email);
    if (matches.length > 1) {
        throw new Error(`Organization user search returned duplicate ${email}`);
    }
    const [match] = matches;
    return match?.userUuid ?? null;
};

const isApiResponse = (
    response: Response,
    method: string,
    pathname: string,
) => {
    const url = new URL(response.url());
    return response.request().method() === method && url.pathname === pathname;
};

const isOrganizationUserSearchResponse = (
    response: Response,
    email: string,
) => {
    if (!isApiResponse(response, 'GET', '/api/v1/org/users')) {
        return false;
    }
    return new URL(response.url()).searchParams.get('searchQuery') === email;
};

const makeInviteeEmail = () => `demo+marygreen-${randomUUID()}@lightdash.com`;

const authenticateSeededAdmin = async (
    adminRequest: APIRequestContext,
    label: string,
) => {
    const loginResponse = await adminRequest.post('/api/v1/login', {
        data: {
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        },
    });
    assertResponseStatus(loginResponse.status(), 200, `${label} login`);
    parseOkPayload(await loginResponse.text(), `${label} login`);

    const userResponse = await adminRequest.get('/api/v1/user');
    assertResponseStatus(userResponse.status(), 200, `${label} validation`);
    const admin = parseOkResults(
        await userResponse.text(),
        `${label} validation`,
    );
    const userUuid = getUuid(admin, 'userUuid', `${label}.results`);
    const email = getString(admin, 'email', `${label}.results`);
    if (
        userUuid !== SEED_ORG_1_ADMIN.user_uuid ||
        email !== SEED_ORG_1_ADMIN_EMAIL.email
    ) {
        throw new Error(`${label} is not the seeded admin`);
    }
};

const openOrganizationUserManagement = async (page: Page) => {
    await authenticateSeededAdmin(page.context().request, 'page-context admin');
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page
        .getByRole('menuitem', {
            name: 'Organization settings',
            exact: true,
        })
        .click();
    await expect(page).toHaveURL(/\/generalSettings\/organization(?:[/?#]|$)/);

    await page
        .getByRole('link', { name: /^(Users & groups|User management)$/ })
        .click();
    await expect(page).toHaveURL(
        /\/generalSettings\/userManagement(?:[/?#]|$)/,
    );
    await expect(page.getByTestId('org-users-search-input')).toBeVisible();
};

const createAdminRequestContext = async (origin: string) => {
    const adminRequest = await playwrightRequest.newContext({
        baseURL: origin,
        storageState: { cookies: [], origins: [] },
    });
    try {
        await authenticateSeededAdmin(adminRequest, 'fresh admin API');
        await adminRequest.storageState({ path: adminAuthenticationFile });
        return adminRequest;
    } catch (error) {
        await adminRequest.dispose();
        throw error;
    }
};

const createInviteWithApi = async (
    adminRequest: APIRequestContext,
    email: string,
) => {
    const response = await adminRequest.post('/api/v1/invite-links', {
        data: { email, role: 'editor' },
    });
    assertResponseStatus(response.status(), 201, 'API invite creation');
    return parseInviteResponse(await response.text(), email);
};

const activateInviteWithApi = async (
    invite: Awaited<ReturnType<typeof parseInviteResponse>>,
) => {
    const inviteeRequest = await playwrightRequest.newContext();
    try {
        const response = await inviteeRequest.post(
            new URL('/api/v1/user', invite.inviteUrl).href,
            {
                data: {
                    firstName: 'Mary',
                    inviteCode: invite.inviteCode,
                    lastName: 'Green',
                    password: inviteePassword,
                },
            },
        );
        assertResponseStatus(response.status(), 200, 'API invite activation');
        return parseRegisteredUserResponse(await response.text(), invite.email);
    } finally {
        await inviteeRequest.dispose();
    }
};

const searchForUserUuid = async (
    adminRequest: APIRequestContext,
    email: string,
) => {
    const response = await adminRequest.get('/api/v1/org/users', {
        params: {
            page: 1,
            pageSize: 50,
            searchQuery: email,
        },
    });
    assertResponseStatus(
        response.status(),
        200,
        'cleanup organization user search',
    );
    return getExactUserUuid(await response.text(), email);
};

const cleanupInvitee = async (
    adminRequest: APIRequestContext,
    email: string,
    capturedUserUuid: string | null,
) => {
    const userUuid =
        capturedUserUuid ?? (await searchForUserUuid(adminRequest, email));
    if (userUuid === null) {
        return;
    }

    const response = await adminRequest.delete(`/api/v1/org/user/${userUuid}`);
    if (response.status() !== 200 && response.status() !== 404) {
        throw new Error(
            `Exact UUID cleanup for ${userUuid} returned ${response.status()}`,
        );
    }

    const remainingUserUuid = await searchForUserUuid(adminRequest, email);
    if (remainingUserUuid !== null) {
        throw new Error(
            `Exact UUID cleanup left organization user ${remainingUserUuid} for ${email}`,
        );
    }
};

test('Should invite user', { tag: '@mutating' }, async ({ page }) => {
    const email = makeInviteeEmail();
    let inviteeUserUuid: string | null = null;

    await openOrganizationUserManagement(page);
    const { origin } = new URL(page.url());
    try {
        await page
            .getByRole('button', { name: 'Add user', exact: true })
            .click();

        const addUserDialog = page.getByRole('dialog').filter({
            has: page.getByText('Add user', { exact: true }),
        });
        await expect(addUserDialog).toBeVisible();
        await addUserDialog
            .getByRole('textbox', {
                name: 'Enter user email address',
                exact: true,
            })
            .fill(email);

        const [inviteResponse] = await Promise.all([
            page.waitForResponse((response) =>
                isApiResponse(response, 'POST', '/api/v1/invite-links'),
            ),
            addUserDialog
                .getByRole('button', {
                    name: /^(Generate|Send) invite$/,
                })
                .click(),
        ]);
        assertResponseStatus(
            inviteResponse.status(),
            201,
            'UI invite creation',
        );
        const invite = parseInviteResponse(await inviteResponse.text(), email);
        inviteeUserUuid = invite.userUuid;

        const inviteLinkInput = addUserDialog.locator('#invite-link-input');
        await expect(inviteLinkInput).toBeVisible();
        await expect(inviteLinkInput).toHaveValue(invite.inviteUrl);

        const inviteUrl = new URL(invite.inviteUrl);
        expect(inviteUrl.origin).toBe(new URL(page.url()).origin);
        expect(inviteUrl.pathname).toBe(`/invite/${invite.inviteCode}`);

        const logoutResponse = await page
            .context()
            .request.get('/api/v1/logout');
        assertResponseStatus(
            logoutResponse.status(),
            200,
            'page-context logout',
        );
        parseOkPayload(await logoutResponse.text(), 'page-context logout');

        const [publicInviteResponse, navigationResponse] = await Promise.all([
            page.waitForResponse((response) =>
                isApiResponse(
                    response,
                    'GET',
                    `/api/v1/invite-links/${invite.inviteCode}`,
                ),
            ),
            page.goto(invite.inviteUrl),
        ]);
        if (navigationResponse === null) {
            throw new Error('Invite navigation did not return a response');
        }
        if (!navigationResponse.ok()) {
            throw new Error(
                `Invite navigation returned ${navigationResponse.status()}`,
            );
        }
        assertResponseStatus(
            publicInviteResponse.status(),
            200,
            'public invite lookup',
        );
        const publicInvite = parseInviteResponse(
            await publicInviteResponse.text(),
            email,
        );
        expect(publicInvite.userUuid).toBe(inviteeUserUuid);

        await expect(
            page.getByRole('heading', {
                name: 'You’ve been invited!',
                exact: true,
            }),
        ).toBeVisible();
        await expect(page.getByText(email, { exact: true })).toBeVisible();
        await page
            .getByRole('button', { name: 'Join your team', exact: true })
            .click();

        await expect(
            page.getByRole('heading', { name: 'Sign up', exact: true }),
        ).toBeVisible();
        await page
            .getByRole('textbox', { name: 'First name', exact: true })
            .fill('Mary');
        await page
            .getByRole('textbox', { name: 'Last name', exact: true })
            .fill('Green');
        const invitedEmailInput = page.getByRole('textbox', {
            name: 'Email address',
            exact: true,
        });
        await expect(invitedEmailInput).toBeDisabled();
        await expect(invitedEmailInput).toHaveValue(email);
        const passwordInput = page.getByRole('textbox', {
            name: 'Password',
            exact: true,
        });
        await passwordInput.fill(inviteePassword);
        const passwordRequirements = page.getByRole('dialog').filter({
            has: page.getByText('must be at least 8 characters long', {
                exact: true,
            }),
        });
        await expect(passwordRequirements).toBeVisible();
        await page
            .getByRole('heading', { name: 'Sign up', exact: true })
            .click();
        await expect(passwordRequirements).not.toBeVisible();

        const [registrationResponse] = await Promise.all([
            page.waitForResponse((response) =>
                isApiResponse(response, 'POST', '/api/v1/user'),
            ),
            page.getByRole('button', { name: 'Sign up', exact: true }).click(),
        ]);
        assertResponseStatus(
            registrationResponse.status(),
            200,
            'UI invite registration',
        );
        const registeredUser = parseRegisteredUserResponse(
            await registrationResponse.text(),
            email,
        );
        expect(registeredUser.userUuid).toBe(inviteeUserUuid);
        expect(registeredUser.firstName).toBe('Mary');
        expect(registeredUser.lastName).toBe('Green');

        await expect(
            page.getByRole('heading', {
                name: 'Check your inbox!',
                exact: true,
            }),
        ).toBeVisible();
        const pinInputs = page.getByTestId('pin-input').locator('input');
        await expect(pinInputs).toHaveCount(6);
        const [first, second, third, fourth, fifth, sixth, ...extra] =
            await pinInputs.all();
        if (
            first === undefined ||
            second === undefined ||
            third === undefined ||
            fourth === undefined ||
            fifth === undefined ||
            sixth === undefined ||
            extra.length > 0
        ) {
            throw new Error('Expected exactly six verification inputs');
        }

        await first.fill('0');
        await second.fill('0');
        await third.fill('0');
        await fourth.fill('0');
        await fifth.fill('0');
        const [verificationResponse] = await Promise.all([
            page.waitForResponse((response) => {
                if (
                    !isApiResponse(
                        response,
                        'GET',
                        '/api/v1/user/me/email/status',
                    )
                ) {
                    return false;
                }
                return (
                    new URL(response.url()).searchParams.get('passcode') ===
                    '000000'
                );
            }),
            sixth.fill('0'),
        ]);
        assertResponseStatus(
            verificationResponse.status(),
            200,
            'email verification',
        );
        const emailStatus = parseEmailStatusResponse(
            await verificationResponse.text(),
        );
        expect(emailStatus.email).toBe(email);
        expect(emailStatus.isVerified).toBe(true);

        const verificationDialog = page.getByRole('dialog').filter({
            has: page.getByText('You are all set!', { exact: true }),
        });
        await expect(verificationDialog).toBeVisible();
        await verificationDialog
            .getByRole('button', { name: 'Continue', exact: true })
            .click();
        await expect(page.getByTestId('user-avatar')).toContainText('MG');
    } finally {
        const adminRequest = await createAdminRequestContext(origin);
        try {
            await cleanupInvitee(adminRequest, email, inviteeUserUuid);
        } finally {
            await adminRequest.dispose();
        }
    }
});

test('Should delete user', { tag: '@mutating' }, async ({ page }) => {
    const email = makeInviteeEmail();
    let inviteeUserUuid: string | null = null;

    await openOrganizationUserManagement(page);
    const { origin } = new URL(page.url());
    const adminRequest = await createAdminRequestContext(origin);
    try {
        const invite = await createInviteWithApi(adminRequest, email);
        inviteeUserUuid = invite.userUuid;
        const registeredUser = await activateInviteWithApi(invite);
        expect(registeredUser.userUuid).toBe(inviteeUserUuid);

        const searchInput = page.getByTestId('org-users-search-input');
        const [searchResponse] = await Promise.all([
            page.waitForResponse((response) =>
                isOrganizationUserSearchResponse(response, email),
            ),
            searchInput.fill(email),
        ]);
        assertResponseStatus(searchResponse.status(), 200, 'UI user search');
        expect(getExactUserUuid(await searchResponse.text(), email)).toBe(
            inviteeUserUuid,
        );

        const exactUserRow = page.getByRole('row').filter({
            has: page.getByText(email, { exact: true }),
        });
        await expect(exactUserRow).toHaveCount(1);
        await expect(exactUserRow).toBeVisible();
        const rowActionButton = exactUserRow.getByRole('button');
        await expect(rowActionButton).toHaveCount(1);
        await rowActionButton.click();

        const [schedulersResponse] = await Promise.all([
            page.waitForResponse((response) =>
                isApiResponse(
                    response,
                    'GET',
                    `/api/v1/org/user/${inviteeUserUuid}/schedulers-summary`,
                ),
            ),
            page
                .getByRole('menuitem', {
                    name: 'Delete user',
                    exact: true,
                })
                .click(),
        ]);
        assertResponseStatus(
            schedulersResponse.status(),
            200,
            'user schedulers summary',
        );
        const schedulersSummary = parseSchedulersSummaryResponse(
            await schedulersResponse.text(),
        );
        expect(schedulersSummary.totalCount).toBe(0);
        expect(schedulersSummary.hasGsheetsSchedulers).toBe(false);

        const deleteDialog = page.getByRole('dialog').filter({
            has: page.getByText('Delete user', { exact: true }),
        });
        await expect(deleteDialog).toBeVisible();
        await expect(
            deleteDialog.getByText(
                'Are you sure you want to delete this user?',
                { exact: true },
            ),
        ).toBeVisible();
        await expect(
            deleteDialog.getByText(email, { exact: true }),
        ).toBeVisible();
        await expect(
            deleteDialog.getByText('This user has no scheduled deliveries.', {
                exact: true,
            }),
        ).toBeVisible();

        const [deleteResponse, refreshedSearchResponse] = await Promise.all([
            page.waitForResponse((response) =>
                isApiResponse(
                    response,
                    'DELETE',
                    `/api/v1/org/user/${inviteeUserUuid}`,
                ),
            ),
            page.waitForResponse((response) =>
                isOrganizationUserSearchResponse(response, email),
            ),
            deleteDialog
                .getByRole('button', {
                    name: 'Delete',
                    exact: true,
                })
                .click(),
        ]);
        assertResponseStatus(deleteResponse.status(), 200, 'UI user deletion');
        parseOkPayload(await deleteResponse.text(), 'UI user deletion');
        assertResponseStatus(
            refreshedSearchResponse.status(),
            200,
            'post-delete user search',
        );
        expect(
            getExactUserUuid(await refreshedSearchResponse.text(), email),
        ).toBeNull();

        await expect(
            page.getByText('Success! User was deleted.', { exact: true }),
        ).toBeVisible();
        await expect(exactUserRow).toHaveCount(0);
    } finally {
        await adminRequest.dispose();
        const cleanupRequest = await createAdminRequestContext(origin);
        try {
            await cleanupInvitee(cleanupRequest, email, inviteeUserUuid);
        } finally {
            await cleanupRequest.dispose();
        }
    }
});
