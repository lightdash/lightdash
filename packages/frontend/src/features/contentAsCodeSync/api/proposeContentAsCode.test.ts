import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('../../../api', () => ({
    lightdashApi: vi.fn(), // pragma: allowlist secret
}));

import { lightdashApi as api } from '../../../api'; // pragma: allowlist secret
import { proposeContentAsCode } from './proposeContentAsCode';

const mockApi = api as unknown as Mock;

describe('proposeContentAsCode', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('posts the slug to the propose endpoint', async () => {
        mockApi.mockResolvedValueOnce({
            prUrl: 'https://example.com/pull/2',
            prTitle: 'Add chart `orders`',
            filesWritten: ['charts/orders.yml'],
            notedChartSlugs: [],
        });

        await expect(
            proposeContentAsCode('project-uuid', 'chart', 'orders'),
        ).resolves.toEqual({
            prUrl: 'https://example.com/pull/2',
            prTitle: 'Add chart `orders`',
            filesWritten: ['charts/orders.yml'],
            notedChartSlugs: [],
        });
        expect(mockApi).toHaveBeenCalledWith({
            url: '/projects/project-uuid/code/propose',
            method: 'POST',
            body: JSON.stringify({ contentType: 'chart', slug: 'orders' }),
        });
    });
});
