import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(), // pragma: allowlist secret
}));

import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import { getContentAsCodeWriteBackStatus } from './getContentAsCodeWriteBackStatus';

const mockApi = api as unknown as Mock;

const writeBackStatus = {
    contentType: 'chart',
    slug: 'orders',
    syncEnabled: true,
    writeBackEnabled: true,
    state: 'ahead',
    writeBack: {
        prState: 'none',
        prUrl: null,
        prTitle: null,
    },
};

describe('getContentAsCodeWriteBackStatus', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns write-back status when the endpoint succeeds', async () => {
        mockApi.mockResolvedValueOnce(writeBackStatus);

        await expect(
            getContentAsCodeWriteBackStatus('project-uuid', 'chart', 'orders'),
        ).resolves.toEqual({ kind: 'ok', status: writeBackStatus });
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/code/write-back-status?contentType=chart&slug=orders',
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
            getContentAsCodeWriteBackStatus('project-uuid', 'chart', 'orders'),
        ).resolves.toEqual({ kind: 'unavailable' });
    });
});
