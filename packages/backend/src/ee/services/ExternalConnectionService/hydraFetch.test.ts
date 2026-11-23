import { HYDRA_DEFAULT_SETTINGS, type HydraApiSource } from '@lightdash/common';
import { createHydraServer } from '../../../services/QuerySourceService/live/integrations/hydra/server';
import { SecureFetchError } from '../../../utils/secureFetch/secureFetch';
import { fetchFromHydra } from './hydraFetch';

const NOW = Date.parse('2026-11-23T12:00:20Z');

const settingsWith = (overrides: Partial<HydraApiSource> = {}) => ({
    ...HYDRA_DEFAULT_SETTINGS,
    ...overrides,
});

const accountCall = (settings: HydraApiSource, timeoutMs = 30_000) =>
    fetchFromHydra({
        connectionUuid: 'connection-1',
        settings,
        secret: 'alice',
        timeoutMs,
        request: { method: 'GET', path: '/v1/account' },
        server: createHydraServer({
            now: () => new Date(NOW),
            sleep: vi.fn(),
        }),
        sleep: vi.fn(),
    });

describe('fetchFromHydra', () => {
    it('answers in-process in the shape the guarded fetch returns', async () => {
        const fetched = await accountCall(settingsWith({ rowCount: 20 }));
        expect(fetched).toMatchObject({
            status: 200,
            contentType: 'application/json',
            truncated: false,
        });
        expect(JSON.parse(fetched.bodyText)).toMatchObject({
            events: 20,
            users: 10,
        });
    });

    it('passes a 429 Retry-After header through', async () => {
        const fetched = await accountCall(
            settingsWith({
                script: [
                    {
                        calls: '1-',
                        respond: { status: 429, retryAfterSeconds: 9 },
                    },
                ],
            }),
        );
        expect(fetched.status).toBe(429);
        expect(fetched.headers['retry-after']).toBe('9');
    });

    it('times out like a slow API when its latency reaches the timeout', async () => {
        await expect(
            accountCall(settingsWith({ latencyMs: 5_000 }), 5_000),
        ).rejects.toMatchObject({ reason: 'timeout' });
        await expect(
            accountCall(settingsWith({ latencyMs: 5_000 }), 5_000),
        ).rejects.toBeInstanceOf(SecureFetchError);
    });
});
