import fetch from 'node-fetch';
import { getConfig } from '../config';
import { LightdashAnalytics } from './analytics';

vi.mock('node-fetch', () => ({ default: vi.fn() }));
vi.mock('../config', () => ({
    getConfig: vi.fn().mockResolvedValue({}),
}));

const sendTelemetry = {
    track: () =>
        LightdashAnalytics.track({
            event: 'stop_preview.missing',
            properties: { name: 'test' },
        }),
    identify: () => LightdashAnalytics.identify({}),
};

describe.each(['track', 'identify'] as const)('%s', (method) => {
    afterEach(() => {
        vi.unstubAllEnvs();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('skips identity lookup and the request when disabled', async () => {
        vi.stubEnv('LIGHTDASH_CLI_ANALYTICS_DISABLED', 'true');

        await sendTelemetry[method]();

        expect(getConfig).not.toHaveBeenCalled();
        expect(fetch).not.toHaveBeenCalled();
    });

    it.each([undefined, 'false'])(
        'sets a request timeout with opt-out set to %s',
        async (optOut) => {
            vi.stubEnv('LIGHTDASH_CLI_ANALYTICS_DISABLED', optOut);
            const { signal } = new AbortController();
            const timeout = vi
                .spyOn(AbortSignal, 'timeout')
                .mockReturnValue(signal);

            await sendTelemetry[method]();

            expect(timeout).toHaveBeenCalledWith(2000);
            expect(fetch).toHaveBeenCalledExactlyOnceWith(
                `https://analytics.lightdash.com/v1/${method}`,
                expect.objectContaining({ method: 'POST', signal }),
            );
        },
    );
});
