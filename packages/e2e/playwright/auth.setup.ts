import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { expect, test as setup } from '@playwright/test';
import { mkdir } from 'fs/promises';
import { dirname } from 'path';
import adminAuthenticationFile from './auth';

setup('authenticate admin', async ({ request }) => {
    const loginResponse = await request.post('/api/v1/login', {
        data: {
            email: SEED_ORG_1_ADMIN_EMAIL.email,
            password: SEED_ORG_1_ADMIN_PASSWORD.password,
        },
    });
    await expect(loginResponse).toBeOK();

    const userResponse = await request.get('/api/v1/user');
    await expect(userResponse).toBeOK();

    await mkdir(dirname(adminAuthenticationFile), { recursive: true });
    await request.storageState({ path: adminAuthenticationFile });
});
