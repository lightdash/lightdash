import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { EMPTY_CONTENT_AS_CODE_SYNC_STATUS } from '../types';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(), // pragma: allowlist secret
}));

import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import { getContentAsCodeSyncStatus } from './getContentAsCodeSyncStatus';

const mockApi = api as unknown as Mock;

const populatedStatus = {
    lastAppliedAt: new Date('2026-08-25T09:00:00.000Z'),
    revisionCount: 1,
    revisions: [
        {
            contentType: 'chart',
            slug: 'orders-over-time',
            contentHash: 'abc123def456',
            appliedAt: new Date('2026-08-25T09:00:00.000Z'),
            appliedByUserUuid: null,
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
        ).resolves.toEqual(populatedStatus);
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/code/sync-status',
            method: 'GET',
            body: undefined,
        });
    });

    it('returns an empty status when the endpoint is not deployed yet', async () => {
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
        ).resolves.toEqual(EMPTY_CONTENT_AS_CODE_SYNC_STATUS);
    });

    it('returns an empty status on a network miss', async () => {
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
        ).resolves.toEqual(EMPTY_CONTENT_AS_CODE_SYNC_STATUS);
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
