import { RoadmapFollowProjectRequestSchema } from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { mockRoadmapProject, mockRoadmapResults } from './roadmap.mock';
import { roadmapApi } from './roadmapApi';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

describe('roadmap API', () => {
    beforeEach(() => vi.resetAllMocks());

    it('posts only the note to the authenticated backend endpoint', async () => {
        const result = { message: 'Request received' };
        vi.mocked(lightdashApi).mockResolvedValue(result);
        expect(
            await roadmapApi.followProject({
                projectId: 'project/id',
                note: 'Our use case',
            }),
        ).toEqual(result);
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
            url: '/org/roadmap/projects/project%2Fid/follow',
            method: 'POST',
            sensitive: true,
            body: JSON.stringify({ note: 'Our use case' }),
            version: 'v1',
        });
    });

    it('keeps server filtering and pagination without reading mock storage', async () => {
        sessionStorage.setItem(
            'ld.roadmap.mockFollows.org-1',
            JSON.stringify(['alpha']),
        );
        const result = mockRoadmapResults([mockRoadmapProject('alpha')]);
        vi.mocked(lightdashApi).mockResolvedValue(result);
        expect(
            await roadmapApi.getProjects({
                page: 2,
                pageSize: 10,
                onlyInterested: true,
                search: 'AI',
                statuses: 'planned',
            }),
        ).toEqual(result);
        expect(lightdashApi).toHaveBeenCalledExactlyOnceWith({
            url: '/org/roadmap/projects?page=2&pageSize=10&onlyInterested=true&search=AI&statuses=planned',
            method: 'GET',
            body: undefined,
            version: 'v1',
        });
        sessionStorage.clear();
    });

    it('propagates failures and rejects invalid confirmations', async () => {
        vi.mocked(lightdashApi).mockRejectedValueOnce(new Error('Unavailable'));
        await expect(
            roadmapApi.followProject({ projectId: 'alpha', note: 'Use case' }),
        ).rejects.toThrow('Unavailable');
        vi.mocked(lightdashApi).mockResolvedValue({ message: '' });
        await expect(
            roadmapApi.followProject({ projectId: 'alpha', note: 'Use case' }),
        ).rejects.toThrow();
    });

    it('requires a trimmed note with at most 2000 characters', () => {
        expect(
            RoadmapFollowProjectRequestSchema.parse({ note: '  Use case  ' }),
        ).toEqual({ note: 'Use case' });
        for (const note of ['', '   ', 'a'.repeat(2001)]) {
            expect(
                RoadmapFollowProjectRequestSchema.safeParse({ note }).success,
            ).toBe(false);
        }
        expect(
            RoadmapFollowProjectRequestSchema.safeParse({
                note: 'a'.repeat(2000),
            }).success,
        ).toBe(true);
    });
});
