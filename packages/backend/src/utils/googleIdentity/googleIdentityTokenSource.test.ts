import Logger from '../../logging/logger';
import {
    GcpMetadataIdentityTokenSource,
    getIdTokenSubject,
} from './googleIdentityTokenSource';

describe('GcpMetadataIdentityTokenSource', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    test('requests a token for the audience from the metadata server', async () => {
        const fetchMock = vi.fn(async () => ({
            ok: true,
            text: async () => 'token',
        }));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            new GcpMetadataIdentityTokenSource().getIdToken('lightdash-a'),
        ).resolves.toBe('token');
        expect(fetchMock).toHaveBeenCalledWith(
            expect.stringContaining('audience=lightdash-a&format=full'),
            expect.objectContaining({
                headers: { 'Metadata-Flavor': 'Google' },
            }),
        );
    });

    test('logs the network error while returning a generic metadata failure', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                throw new Error('request timed out');
            }),
        );

        await expect(
            new GcpMetadataIdentityTokenSource().getIdToken('lightdash-a'),
        ).rejects.toThrow(
            "The server couldn't get its Google identity token. Try again, or contact support.",
        );
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            'Could not reach the GCP metadata server for an identity token: request timed out',
        );
    });
    test('logs the HTTP status without reading a metadata error response body', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => Logger);
        const text = vi.fn(async () => 'sensitive-token-value');
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ ok: false, status: 500, text })),
        );
        await expect(
            new GcpMetadataIdentityTokenSource().getIdToken('audience'),
        ).rejects.toThrow("The server couldn't get its Google identity token");
        expect(warn).toHaveBeenCalledExactlyOnceWith(
            'The GCP metadata server returned 500 for an identity token',
        );
        expect(text).not.toHaveBeenCalled();
    });
});

test('reads a Google identity subject without accepting malformed claims', () => {
    const token = `header.${Buffer.from(JSON.stringify({ sub: '123' })).toString('base64url')}.signature`;
    expect(getIdTokenSubject(token)).toBe('123');
    expect(getIdTokenSubject('malformed')).toBeUndefined();
});
