import { google } from 'googleapis';
import { GoogleServiceAccountTokenProvider } from './GoogleServiceAccountTokenProvider';

vi.mock('googleapis', () => ({
    google: { auth: { JWT: vi.fn() } },
}));

const JWTMock = vi.mocked(google.auth.JWT);

const KEYFILE = JSON.stringify({
    type: 'service_account',
    client_email: 'sa@proj.iam.gserviceaccount.com',
    private_key:
        '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});

let currentToken: string | null;
let currentExpiry: number;

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    JWTMock.mockReset();
    currentToken = 'tok-1';
    currentExpiry = Date.now() + 3_600_000; // 1h
    // Regular function so it's constructable via `new google.auth.JWT(...)`.
    JWTMock.mockImplementation(function MockJwt(this: {
        credentials: { expiry_date?: number };
        getAccessToken: unknown;
    }) {
        this.credentials = {};
        this.getAccessToken = vi.fn().mockImplementation(async () => {
            this.credentials.expiry_date = currentExpiry;
            return { token: currentToken };
        });
    } as unknown as typeof google.auth.JWT);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('GoogleServiceAccountTokenProvider', () => {
    it('mints a token from the keyfile + scopes', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        const token = await provider.getAccessToken(KEYFILE, [
            'https://www.googleapis.com/auth/bigquery',
        ]);
        expect(token).toBe('tok-1');
        expect(JWTMock).toHaveBeenCalledTimes(1);
        expect(JWTMock).toHaveBeenCalledWith({
            email: 'sa@proj.iam.gserviceaccount.com',
            key: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
            scopes: ['https://www.googleapis.com/auth/bigquery'],
        });
    });

    it('caches the token across calls with the same keyfile + scopes', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        await provider.getAccessToken(KEYFILE, ['a']);
        const second = await provider.getAccessToken(KEYFILE, ['a']);
        expect(second).toBe('tok-1');
        expect(JWTMock).toHaveBeenCalledTimes(1);
    });

    it('cache key is insensitive to scope order', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        await provider.getAccessToken(KEYFILE, ['a', 'b']);
        await provider.getAccessToken(KEYFILE, ['b', 'a']);
        expect(JWTMock).toHaveBeenCalledTimes(1);
    });

    it('re-mints when the scopes change', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        await provider.getAccessToken(KEYFILE, ['a']);
        await provider.getAccessToken(KEYFILE, ['b']);
        expect(JWTMock).toHaveBeenCalledTimes(2);
    });

    it('re-mints when the keyfile changes', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        await provider.getAccessToken(KEYFILE, ['a']);
        const otherKeyfile = JSON.stringify({
            type: 'service_account',
            client_email: 'other@proj.iam.gserviceaccount.com',
            private_key:
                '-----BEGIN PRIVATE KEY-----\nxyz\n-----END PRIVATE KEY-----\n',
        });
        await provider.getAccessToken(otherKeyfile, ['a']);
        expect(JWTMock).toHaveBeenCalledTimes(2);
    });

    it('refreshes when the cached token is within the skew buffer of expiry', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        currentExpiry = Date.now() + 3_600_000;
        await provider.getAccessToken(KEYFILE, ['a']);

        // Advance to within the 60s skew buffer of expiry → must re-mint.
        vi.advanceTimersByTime(3_600_000 - 30_000);
        currentToken = 'tok-2';
        currentExpiry = Date.now() + 3_600_000;
        const refreshed = await provider.getAccessToken(KEYFILE, ['a']);
        expect(refreshed).toBe('tok-2');
        expect(JWTMock).toHaveBeenCalledTimes(2);
    });

    it('shares a single mint across concurrent cache-miss calls (single-flight)', async () => {
        const provider = new GoogleServiceAccountTokenProvider();
        const [a, b] = await Promise.all([
            provider.getAccessToken(KEYFILE, ['a']),
            provider.getAccessToken(KEYFILE, ['a']),
        ]);
        expect(a).toBe('tok-1');
        expect(b).toBe('tok-1');
        expect(JWTMock).toHaveBeenCalledTimes(1);
    });

    it('throws when Google returns no token', async () => {
        currentToken = null;
        const provider = new GoogleServiceAccountTokenProvider();
        await expect(provider.getAccessToken(KEYFILE, ['a'])).rejects.toThrow(
            'Google did not return an access token',
        );
    });
});
