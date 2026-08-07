import { type PreflightProbe } from '@lightdash/common';
import fetch, { Response } from 'node-fetch';
import { type Config } from '../config';
import { createProbeClient, type ProbeClientDependencies } from './probeClient';

const config: Config = {
    context: {
        serverUrl: 'https://lightdash.example.com',
        apiKey: 'api-key',
    },
};

const makeProbe = (inserts: number): PreflightProbe => ({
    serverTime: '2026-08-07T12:00:00.000Z',
    lock: { isLocked: false, lastMigrationAgeSeconds: 60 },
    tableStats: [
        {
            table: 'users',
            inserts,
            updates: inserts,
            deletes: inserts,
            liveTuples: 1000,
        },
    ],
    activity: [],
});

const okResponse = (probe: PreflightProbe): Response =>
    new Response(JSON.stringify({ status: 'ok', results: probe }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
    });

const errorResponse = (status: number, message: string): Response =>
    new Response(JSON.stringify({ status: 'error', error: { message } }), {
        status,
        headers: { 'content-type': 'application/json' },
    });

const makeDependencies = (responses: Response[]): ProbeClientDependencies => {
    const request = vi.fn<typeof fetch>();
    for (const response of responses) request.mockResolvedValueOnce(response);
    return {
        fetch: request,
        getConfig: vi.fn<() => Promise<Config>>().mockResolvedValue(config),
        sleep: vi
            .fn<(milliseconds: number) => Promise<void>>()
            .mockResolvedValue(),
    };
};

describe('probe client', () => {
    it('calls the authenticated endpoint twice with the requested interval', async () => {
        const dependencies = makeDependencies([
            okResponse(makeProbe(1)),
            okResponse(makeProbe(3)),
        ]);

        await createProbeClient(dependencies).sample(['users'], 12);

        expect(dependencies.fetch).toHaveBeenCalledTimes(2);
        expect(dependencies.fetch).toHaveBeenNthCalledWith(
            1,
            'https://lightdash.example.com/api/v1/preflight/probe?tables=users',
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    Authorization: 'ApiKey api-key',
                }),
            }),
        );
        expect(dependencies.sleep).toHaveBeenCalledWith(12000);
    });

    it('prevents a stats reset from producing a negative counter delta', async () => {
        const sample = await createProbeClient(
            makeDependencies([
                okResponse(makeProbe(100)),
                okResponse(makeProbe(5)),
            ]),
        ).sample(['users'], 10);

        const before = sample.before.statRows[0];
        const after = sample.after.statRows[0];
        expect(after.n_tup_ins - before.n_tup_ins).toBe(0);
        expect(after.n_tup_upd - before.n_tup_upd).toBe(0);
        expect(after.n_tup_del - before.n_tup_del).toBe(0);
    });

    it('maps 401 to an authentication action', async () => {
        const promise = createProbeClient(
            makeDependencies([errorResponse(401, 'Unauthorized')]),
        ).sample([], 10);

        await expect(promise).rejects.toMatchObject({
            failure: 'unauthorized',
            message: expect.stringContaining("Run 'lightdash login'"),
        });
    });

    it('maps 403 to an organization-admin action', async () => {
        const promise = createProbeClient(
            makeDependencies([errorResponse(403, 'Forbidden')]),
        ).sample([], 10);

        await expect(promise).rejects.toMatchObject({
            failure: 'forbidden',
            message: expect.stringContaining('organization-admin API key'),
        });
    });

    it('maps 404 to the feature-gate and restart action', async () => {
        const promise = createProbeClient(
            makeDependencies([errorResponse(404, 'Not found')]),
        ).sample([], 10);

        await expect(promise).rejects.toMatchObject({
            failure: 'disabled',
            message: expect.stringContaining(
                'Set PREFLIGHT_PROBE_ENABLED=true',
            ),
        });
    });

    it('recognizes the feature-gate message returned as 403', async () => {
        const promise = createProbeClient(
            makeDependencies([
                errorResponse(
                    403,
                    'Preflight probe is not enabled on this instance (set PREFLIGHT_PROBE_ENABLED=true)',
                ),
            ]),
        ).sample([], 10);

        await expect(promise).rejects.toMatchObject({
            failure: 'disabled',
            message: expect.stringContaining('restart the instance'),
        });
    });
});
