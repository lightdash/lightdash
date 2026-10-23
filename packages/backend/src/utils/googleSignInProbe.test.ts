import { WarehouseSignInRejection } from '@lightdash/common';
import { GoogleAuth } from 'google-auth-library';
import { GoogleSignInProbe } from './googleSignInProbe';

const { accessToken } = vi.hoisted(() => ({ accessToken: vi.fn() }));
vi.mock('google-auth-library', () => ({
    GoogleAuth: vi.fn(
        class MockGoogleAuth {
            getAccessToken = accessToken;
        },
    ),
}));
const keyfile = {
    type: 'authorized_user',
    client_id: 'client_a',
    client_secret: 'secret_a',
    refresh_token: 'token_a',
};
beforeEach(() => {
    vi.clearAllMocks();
    accessToken.mockReset().mockResolvedValue('access_a');
});
afterEach(() => vi.useRealTimers());

test.each([
    ['invalid_grant', undefined, WarehouseSignInRejection.INVALID_GRANT],
    ['invalid_grant', 'invalid_rapt', WarehouseSignInRejection.INVALID_RAPT],
    ['invalid_grant', 'rapt_required', WarehouseSignInRejection.RAPT_REQUIRED],
    ['invalid_rapt', undefined, WarehouseSignInRejection.INVALID_RAPT],
])(
    'recognizes confirmed rejection %s %s',
    async (error, error_subtype, rejection) => {
        accessToken.mockRejectedValue({
            response: { status: 400, data: { error, error_subtype } },
        });
        await expect(
            new GoogleSignInProbe().check(keyfile, 'incarnation_a'),
        ).resolves.toEqual({ expired: true, rejection });
    },
);

test.each([
    new Error('network unavailable'),
    { response: { status: 503, data: { error: 'invalid_grant' } } },
    { response: { status: 400, data: 'invalid_grant' } },
    { response: { status: 400, data: { error: 'invalid_client' } } },
])('leaves unconfirmed responses unknown', async (error) => {
    accessToken.mockRejectedValue(error);
    await expect(
        new GoogleSignInProbe().check(keyfile, 'incarnation_a'),
    ).resolves.toEqual({ expired: undefined });
});

test('coalesces requests, retains status for one minute, and separates incarnations', async () => {
    vi.useFakeTimers();
    const probe = new GoogleSignInProbe();
    let release!: () => void;
    accessToken.mockImplementationOnce(
        () =>
            new Promise<void>((resolve) => {
                release = resolve;
            }),
    );
    const requests = [
        probe.check(keyfile, 'incarnation_a'),
        probe.check(keyfile, 'incarnation_a'),
    ];
    expect(accessToken).toHaveBeenCalledTimes(1);
    release();
    await Promise.all(requests);
    await probe.check(keyfile, 'incarnation_a');
    expect(accessToken).toHaveBeenCalledTimes(1);
    await probe.check(keyfile, 'incarnation_b');
    expect(accessToken).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    await probe.check(keyfile, 'incarnation_a');
    expect(accessToken).toHaveBeenCalledTimes(3);
    expect(GoogleAuth).toHaveBeenCalledWith(
        expect.objectContaining({
            clientOptions: {
                transporterOptions: { timeout: 10_000, retry: false },
            },
        }),
    );
});

test('evicts the oldest entry after 100 credential incarnations', async () => {
    const probe = new GoogleSignInProbe();
    await Promise.all(
        Array.from({ length: 101 }, (_, index) =>
            probe.check(keyfile, `incarnation_${index}`),
        ),
    );
    await probe.check(keyfile, 'incarnation_0');
    expect(accessToken).toHaveBeenCalledTimes(102);
});

test('coalesces a new marked attempt but never reuses a healthy result after a current rejection', async () => {
    const probe = new GoogleSignInProbe();
    await probe.check(keyfile, 'incarnation_a');
    const pending = Promise.withResolvers<never>();
    accessToken.mockReturnValueOnce(pending.promise);
    const first = probe.check(keyfile, 'incarnation_a', true);
    const second = probe.check(keyfile, 'incarnation_a', true);
    expect(accessToken).toHaveBeenCalledTimes(2);
    pending.reject({
        response: { status: 400, data: { error: 'invalid_grant' } },
    });
    const rejected = {
        expired: true,
        rejection: WarehouseSignInRejection.INVALID_GRANT,
    };
    expect(await first).toEqual(rejected);
    expect(await second).toEqual(rejected);
    expect(await probe.check(keyfile, 'incarnation_a', true)).toEqual(rejected);
    expect(accessToken).toHaveBeenCalledTimes(2);
});

test('a healthy marked status is not cached across a later rejection on the same incarnation', async () => {
    const probe = new GoogleSignInProbe();
    await probe.check(keyfile, 'incarnation_a', true);
    accessToken.mockRejectedValue({
        response: { status: 400, data: { error: 'invalid_grant' } },
    });
    expect(await probe.check(keyfile, 'incarnation_a', true)).toEqual({
        expired: true,
        rejection: WarehouseSignInRejection.INVALID_GRANT,
    });
    expect(accessToken).toHaveBeenCalledTimes(2);
});
