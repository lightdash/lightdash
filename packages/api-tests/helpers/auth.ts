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
import { ApiClient } from './api-client';

async function loginWith(email: string, password: string): Promise<ApiClient> {
    const client = new ApiClient();
    const resp = await client.post('/api/v1/login', { email, password });
    if (resp.status !== 200) {
        throw new Error(`Login failed for ${email}: ${resp.status}`);
    }
    return client;
}

export async function login(): Promise<ApiClient> {
    return loginWith(
        SEED_ORG_1_ADMIN_EMAIL.email,
        SEED_ORG_1_ADMIN_PASSWORD.password,
    );
}

export async function loginAsEditor(): Promise<ApiClient> {
    return loginWith(
        SEED_ORG_1_EDITOR_EMAIL.email,
        SEED_ORG_1_EDITOR_PASSWORD.password,
    );
}

export async function loginAsViewer(): Promise<ApiClient> {
    return loginWith(
        SEED_ORG_1_VIEWER_EMAIL.email,
        SEED_ORG_1_VIEWER_PASSWORD.password,
    );
}

export async function anotherLogin(): Promise<ApiClient> {
    return loginWith(
        SEED_ORG_2_ADMIN_EMAIL.email,
        SEED_ORG_2_ADMIN_PASSWORD.password,
    );
}

type ProjectPermission = {
    role: string;
    projectUuid: string;
};

/**
 * Creates a new user with the given org role and project permissions,
 * then returns a logged-in ApiClient for that user.
 */
export async function loginWithPermissions(
    orgRole: string,
    projectPermissions: ProjectPermission[],
): Promise<{ client: ApiClient; email: string }> {
    const admin = await login();

    const email = `demo+${orgRole}-${Date.now()}@lightdash.com`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Create invite
    const inviteResp = await admin.post<{
        results: { inviteCode: string };
    }>('/api/v1/invite-links', {
        role: orgRole,
        email,
        expiresAt,
    });
    expect(inviteResp.status).toBe(201);
    const { inviteCode } = inviteResp.body.results;

    // Add project permissions
    for (const perm of projectPermissions) {
        await admin.post(`/api/v1/projects/${perm.projectUuid}/access`, {
            role: perm.role,
            email,
            sendEmail: false,
        });
    }

    // Register with invite code
    const registerResp = await admin.post('/api/v1/user', {
        inviteCode,
        firstName: 'test',
        lastName: 'test',
        password: 'test1234',
    });
    expect(registerResp.status).toBe(200);

    // Verify email
    await admin.get('/api/v1/user/me/email/status?passcode=000000');

    // Login as the new user
    const client = await loginWith(email, 'test1234');
    return { client, email };
}

export async function loginWithEmail(email: string): Promise<ApiClient> {
    return loginWith(email, 'test1234');
}
