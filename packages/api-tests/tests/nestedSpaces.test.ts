import { SEED_PROJECT } from '@lightdash/common';
import { type Body } from '../helpers/api-client';
import { login } from '../helpers/auth';

const apiUrl = '/api/v1';

describe('Lightdash API tests for my own private spaces as admin', () => {
    let admin: Awaited<ReturnType<typeof login>>;

    beforeAll(async () => {
        admin = await login();
    });

    it('Should not create duplicate slugs in the same project', async () => {
        const spaceName = `📈 Space Namè ${Date.now()}`;
        const res1 = await admin.post<Body<{ slug: string; uuid: string }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            { name: spaceName },
        );
        expect(res1.status).toBe(200);

        const res2 = await admin.post<Body<{ slug: string; uuid: string }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            { name: spaceName },
        );
        expect(res2.status).toBe(200);
        expect(res2.body.results.slug).not.toBe(res1.body.results.slug);
    });

    it('Should not create duplicate slugs in the same project for nested spaces', async () => {
        const spaceName = `📈 Space Namè ${Date.now()}`;
        const res1 = await admin.post<Body<{ slug: string; uuid: string }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            { name: spaceName },
        );
        expect(res1.status).toBe(200);

        const res2 = await admin.post<Body<{ slug: string; uuid: string }>>(
            `${apiUrl}/projects/${SEED_PROJECT.project_uuid}/spaces`,
            { name: spaceName, parentSpaceUuid: res1.body.results.uuid },
        );
        expect(res2.status).toBe(200);
        expect(res2.body.results.slug).not.toBe(res1.body.results.slug);
    });
});
