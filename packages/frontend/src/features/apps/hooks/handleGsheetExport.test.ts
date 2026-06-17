import { describe, expect, it, vi } from 'vitest';
import { handleGsheetExport } from './handleGsheetExport';

describe('handleGsheetExport', () => {
    const baseDeps = () => {
        const getAccessToken = vi.fn();
        const triggerLogin = vi.fn();
        const lightdashApi = vi.fn();
        const ability = { can: vi.fn(() => true) };
        return {
            getAccessToken,
            triggerLogin,
            lightdashApi,
            ability,
            health: {
                auth: {
                    google: {
                        oauth2ClientId: 'x',
                        googleDriveApiKey: 'y',
                    },
                },
                siteUrl: 'https://lightdash.local',
            },
            projectUuid: 'proj-1',
            organizationUuid: 'org-1',
            pollIntervalMs: 1, // fast polling for tests
        };
    };

    const req = {
        title: 'My Export',
        columns: [{ key: 'a' }],
        rows: [{ a: 1 }],
    };

    it('rejects when capabilities.gsheetExport is not true', async () => {
        const deps = baseDeps();
        await expect(
            handleGsheetExport(req, { ...deps, capability: false }),
        ).rejects.toThrow(
            'Google Sheets export is not available in this context',
        );
    });

    it('rejects when GoogleSheets ability is denied', async () => {
        const deps = baseDeps();
        deps.ability.can = vi.fn(() => false);
        await expect(
            handleGsheetExport(req, { ...deps, capability: true }),
        ).rejects.toThrow(/permission/i);
    });

    it('opens OAuth popup when access-token call fails, then retries and POSTs', async () => {
        const deps = baseDeps();
        deps.getAccessToken
            .mockRejectedValueOnce(new Error('no token'))
            .mockResolvedValueOnce('access-token');
        deps.triggerLogin.mockResolvedValue(undefined);
        deps.lightdashApi
            .mockResolvedValueOnce({ jobId: 'job-1' })
            .mockResolvedValueOnce({
                status: 'completed',
                url: 'https://sheets/abc',
            });

        const result = await handleGsheetExport(req, {
            ...deps,
            capability: true,
        });
        expect(deps.triggerLogin).toHaveBeenCalledWith(
            'gdrive',
            'https://lightdash.local',
        );
        expect(result).toEqual({ fileUrl: 'https://sheets/abc' });
    });

    it('rejects when the popup login fails', async () => {
        const deps = baseDeps();
        deps.getAccessToken.mockRejectedValueOnce(new Error('no token'));
        deps.triggerLogin.mockRejectedValue(new Error('cancelled'));
        await expect(
            handleGsheetExport(req, { ...deps, capability: true }),
        ).rejects.toThrow(/cancelled|Google authentication/);
    });

    it('rejects when the job errors', async () => {
        const deps = baseDeps();
        deps.getAccessToken.mockResolvedValue('access-token');
        deps.lightdashApi
            .mockResolvedValueOnce({ jobId: 'job-1' })
            .mockResolvedValueOnce({
                status: 'error',
                error: 'Backend went boom',
            });
        await expect(
            handleGsheetExport(req, { ...deps, capability: true }),
        ).rejects.toThrow('Backend went boom');
    });

    it('rejects when completed status arrives without a url', async () => {
        const deps = baseDeps();
        deps.getAccessToken.mockResolvedValue('access-token');
        deps.lightdashApi
            .mockResolvedValueOnce({ jobId: 'job-1' })
            .mockResolvedValueOnce({ status: 'completed' });
        await expect(
            handleGsheetExport(req, { ...deps, capability: true }),
        ).rejects.toThrow(/no Google Sheets URL/);
    });

    it('rejects when the job stays pending past the poll deadline', async () => {
        const deps = baseDeps();
        deps.getAccessToken.mockResolvedValue('access-token');
        deps.lightdashApi.mockImplementation(({ url }) => {
            if (url === '/gdrive/upload-gsheet-from-rows') {
                return Promise.resolve({ jobId: 'job-1' });
            }
            return Promise.resolve({ status: 'pending' });
        });
        await expect(
            handleGsheetExport(req, {
                ...deps,
                capability: true,
                pollIntervalMs: 1,
                pollTimeoutMs: 10,
            }),
        ).rejects.toThrow(/timed out/);
    });
});
