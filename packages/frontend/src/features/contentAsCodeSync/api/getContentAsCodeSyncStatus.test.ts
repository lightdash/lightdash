import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(), // pragma: allowlist secret
}));

import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import { getContentAsCodeSyncStatus } from './getContentAsCodeSyncStatus';

const mockApi = api as unknown as Mock;

const populatedStatus = {
    syncEnabled: true,
    lastAppliedAt: new Date('2026-08-25T09:00:00.000Z'),
    items: [
        {
            contentType: 'chart',
            slug: 'orders-over-time',
            state: 'ahead',
            appliedAt: new Date('2026-08-25T09:00:00.000Z'),
            contentHash: 'abc123',
            snapshot: { name: 'old' },
            current: { name: 'new' },
        },
    ],
};

describe('getContentAsCodeSyncStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns the sync status when the endpoint succeeds', async () => {
        mockApi.mockResolvedValueOnce(populatedStatus);

        await expect(
            getContentAsCodeSyncStatus('project-uuid'),
        ).resolves.toEqual({ kind: 'ok', status: populatedStatus });
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/code/sync-status',
            method: 'GET',
            body: undefined,
        });
    });

    it('returns unavailable when the endpoint is not deployed yet', async () => {
        mockApi.mockRejectedValueOnce({
            status: 'error',
            error: {
                name: 'NotFoundError',
                statusCode: 404,
                message: 'Not found',
                data: {},
            },
        });

        await expect(
            getContentAsCodeSyncStatus('project-uuid'),
        ).resolves.toEqual({ kind: 'unavailable' });
    });

    it('returns unavailable on a network miss', async () => {
        mockApi.mockRejectedValueOnce({
            status: 'error',
            error: {
                name: 'NetworkError',
                statusCode: 500,
                message: 'Unable to reach the server',
                data: {},
            },
        });

        await expect(
            getContentAsCodeSyncStatus('project-uuid'),
        ).resolves.toEqual({ kind: 'unavailable' });
    });

    it('rethrows unexpected API errors', async () => {
        const forbidden = {
            status: 'error' as const,
            error: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'Forbidden',
                data: {},
            },
        };
        mockApi.mockRejectedValueOnce(forbidden);

        await expect(
            getContentAsCodeSyncStatus('project-uuid'),
        ).rejects.toEqual(forbidden);
    });
});
