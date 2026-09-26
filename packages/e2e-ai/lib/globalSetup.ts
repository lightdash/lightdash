import {
    SEED_ORG_1_ADMIN_EMAIL,
    SEED_ORG_1_ADMIN_PASSWORD,
} from '@lightdash/common';
import { request } from 'playwright/test';
import { createApi } from './api';
import { sweepDeadWorkers } from './cleanupLedger';
import { createPool } from './db';
import { siteUrl } from './env';

/** Before any test: undo fixtures that a killed earlier run left behind. */
export default async function globalSetup() {
    const context = await request.newContext({ baseURL: siteUrl, timeout: 0 });
    const db = createPool();
    try {
        const login = await context.post('/api/v1/login', {
            data: {
                email: SEED_ORG_1_ADMIN_EMAIL.email,
                password: SEED_ORG_1_ADMIN_PASSWORD.password,
            },
        });
        if (!login.ok()) {
            throw new Error(
                `Login at ${siteUrl} failed: HTTP ${login.status()}`,
            );
        }
        await sweepDeadWorkers(createApi(context), db);
    } finally {
        await context.dispose();
        await db.end();
    }
}
