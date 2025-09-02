import { APIRequestContext, expect } from '@playwright/test';
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

export async function loginAs(request: APIRequestContext, email: string, password: string) {
    const response = await request.post('/api/v1/login', {
        data: {
            email,
            password,
        },
    });
    expect(response.status()).toBe(200);
    return response;
}

export async function login(request: APIRequestContext) {
    return loginAs(request, SEED_ORG_1_ADMIN_EMAIL.email, SEED_ORG_1_ADMIN_PASSWORD.password);
}

export async function loginAsEditor(request: APIRequestContext) {
    return loginAs(request, SEED_ORG_1_EDITOR_EMAIL.email, SEED_ORG_1_EDITOR_PASSWORD.password);
}

export async function loginAsViewer(request: APIRequestContext) {
    return loginAs(request, SEED_ORG_1_VIEWER_EMAIL.email, SEED_ORG_1_VIEWER_PASSWORD.password);
}

export async function anotherLogin(request: APIRequestContext) {
    return loginAs(request, SEED_ORG_2_ADMIN_EMAIL.email, SEED_ORG_2_ADMIN_PASSWORD.password);
}

export async function logout(request: APIRequestContext) {
    const response = await request.get('/api/v1/logout');
    return response;
}
