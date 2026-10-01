import { LightdashAppUuidHeader } from '@lightdash/common';
import type { Request, Response } from 'express';
import {
    getQueryRequestContext,
    requestExecutionContextMiddleware,
} from './winston';

it('isolates server-generated timing/identity and preserves app attribution per request', async () => {
    const run = (org: string, app: string) =>
        new Promise<ReturnType<typeof getQueryRequestContext>>((resolve) => {
            requestExecutionContextMiddleware(
                {
                    account: { organization: { organizationUuid: org } },
                    headers: {
                        [LightdashAppUuidHeader.toLowerCase()]: app,
                        'x-request-id': 'client-controlled',
                        authorization: 'secret',
                    },
                } as unknown as Request,
                {} as Response,
                () => {
                    void Promise.resolve().then(() =>
                        resolve(getQueryRequestContext()),
                    );
                },
            );
        });
    const started = Date.now();
    const [a, b] = await Promise.all([
        run('org-a', 'app-a'),
        run('org-b', 'app-b'),
    ]);
    expect(a).toMatchObject({ organization_uuid: 'org-a', app_uuid: 'app-a' });
    expect(b).toMatchObject({ organization_uuid: 'org-b', app_uuid: 'app-b' });
    expect(a.query_request?.requestId).not.toBe(b.query_request?.requestId);
    expect(a.query_request?.startedAtMs).toBeGreaterThanOrEqual(started);
    expect(JSON.stringify([a, b])).not.toContain('secret');
    expect(JSON.stringify([a, b])).not.toContain('client-controlled');
    expect(getQueryRequestContext()).toEqual({});
});
