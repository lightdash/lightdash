import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(), // pragma: allowlist secret
}));

import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import { restampContentAsCodeRevision } from './restampContentAsCodeRevision';

const mockApi = api as unknown as Mock;

describe('restampContentAsCodeRevision', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('posts the slug and content type', async () => {
        const status = {
            syncEnabled: true,
            lastAppliedAt: new Date('2026-08-25T09:00:00.000Z'),
            items: [],
        };
        mockApi.mockResolvedValueOnce(status);

        await expect(
            restampContentAsCodeRevision({
                projectUuid: 'project-uuid',
                contentType: 'chart',
                slug: 'orders-over-time',
            }),
        ).resolves.toEqual(status);
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/code/applied-revisions/restamp',
            method: 'POST',
            body: JSON.stringify({
                contentType: 'chart',
                slug: 'orders-over-time',
            }),
        });
    });
});
