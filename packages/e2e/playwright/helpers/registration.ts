import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Register a new user with a unique email.
 * Equivalent to cy.registerNewUser()
 */
export async function registerNewUser(
    request: APIRequestContext,
): Promise<string> {
    const email = `demo+${Date.now()}@lightdash.com`;
    await request.post('api/v1/user', {
        data: {
            firstName: 'Test',
            lastName: 'e2e',
            email,
            password: 'demo_password!',
        },
    });
    return email;
}

/**
 * Register a user with an invite code.
 * Equivalent to cy.registerWithCode(inviteCode)
 */
export async function registerWithCode(
    request: APIRequestContext,
    inviteCode: string,
): Promise<void> {
    const response = await request.post('api/v1/user', {
        headers: { 'Content-type': 'application/json' },
        data: {
            inviteCode,
            firstName: 'test',
            lastName: 'test',
            password: 'test1234',
        },
    });
    expect(response.status()).toBe(200);
}

/**
 * Verify email with passcode.
 * Equivalent to cy.verifyEmail()
 */
export async function verifyEmail(request: APIRequestContext): Promise<void> {
    const response = await request.get(
        'api/v1/user/me/email/status?passcode=000000',
        { headers: { 'Content-type': 'application/json' } },
    );
    expect(response.status()).toBe(200);
}

/**
 * Create an invite link.
 * Equivalent to cy.invite(email, role)
 */
export async function invite(
    request: APIRequestContext,
    email: string,
    role: string,
): Promise<string> {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const response = await request.post('api/v1/invite-links', {
        headers: { 'Content-type': 'application/json' },
        data: { role, email, expiresAt },
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    return body.results.inviteCode;
}

/**
 * Add project permission for a user.
 * Equivalent to cy.addProjectPermission(email, role, projectUuid)
 */
export async function addProjectPermission(
    request: APIRequestContext,
    email: string,
    role: string,
    projectUuid: string,
): Promise<void> {
    const response = await request.post(
        `api/v1/projects/${projectUuid}/access`,
        {
            headers: { 'Content-type': 'application/json' },
            data: { role, email, sendEmail: false },
        },
    );
    expect(response.status()).toBe(200);
}

/**
 * Logout the current session.
 * Equivalent to cy.logout()
 */
export async function logout(request: APIRequestContext): Promise<void> {
    await request.get('api/v1/logout');
}

type ProjectPermission = {
    role: string;
    projectUuid: string;
};

/**
 * Login as admin, create a user with specific permissions, and return the email.
 * Equivalent to cy.loginWithPermissions(orgRole, projectPermissions)
 */
export async function loginWithPermissions(
    request: APIRequestContext,
    orgRole: string,
    projectPermissions: ProjectPermission[],
): Promise<string> {
    // Login as admin first
    const loginResponse = await request.post('api/v1/login', {
        data: {
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        },
    });
    expect(loginResponse.status()).toBe(200);

    const email = `demo+${orgRole}-${Date.now()}@lightdash.com`;

    const inviteCode = await invite(request, email, orgRole);

    // eslint-disable-next-line no-restricted-syntax
    for (const projectPermission of projectPermissions) {
        // eslint-disable-next-line no-await-in-loop
        await addProjectPermission(
            request,
            email,
            projectPermission.role,
            projectPermission.projectUuid,
        );
    }

    await registerWithCode(request, inviteCode);
    await verifyEmail(request);

    return email;
}

/**
 * Login with a specific email (password: test1234).
 * Equivalent to cy.loginWithEmail(email)
 * Returns a new page with authenticated context.
 */
export async function loginWithEmail(
    browser: Browser,
    request: APIRequestContext,
    email: string,
): Promise<Page> {
    const loginResponse = await request.post('api/v1/login', {
        data: { email, password: 'test1234' },
    });
    expect(loginResponse.status()).toBe(200);

    // Create a new context and save the state
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login in the new context
    const response = await page.request.post('api/v1/login', {
        data: { email, password: 'test1234' },
    });
    expect(response.status()).toBe(200);

    return page;
}
