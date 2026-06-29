import { resolveOtelExportHeaders } from './gcpOtelAuth';

describe('resolveOtelExportHeaders', () => {
    test('returns no headers for the "none" auth path', async () => {
        const minter = jest.fn();
        await expect(
            resolveOtelExportHeaders({ type: 'none' }, minter),
        ).resolves.toEqual({});
        expect(minter).not.toHaveBeenCalled();
    });

    test('mints a fresh bearer token for the gcp auth path', async () => {
        const minter = jest.fn().mockResolvedValue('fake-access-token');
        await expect(
            resolveOtelExportHeaders(
                { type: 'gcp', quotaProjectId: null },
                minter,
            ),
        ).resolves.toEqual({ Authorization: 'Bearer fake-access-token' });
        expect(minter).toHaveBeenCalledTimes(1);
    });

    test('adds the quota-project header when configured', async () => {
        const minter = jest.fn().mockResolvedValue('fake-access-token');
        await expect(
            resolveOtelExportHeaders(
                { type: 'gcp', quotaProjectId: 'proj-123' },
                minter,
            ),
        ).resolves.toEqual({
            Authorization: 'Bearer fake-access-token',
            'X-Goog-User-Project': 'proj-123',
        });
    });

    test('throws when no token can be minted so the caller can skip tracing', async () => {
        await expect(
            resolveOtelExportHeaders(
                { type: 'gcp', quotaProjectId: null },
                async () => null,
            ),
        ).rejects.toThrow('no access token resolved');
    });
});
