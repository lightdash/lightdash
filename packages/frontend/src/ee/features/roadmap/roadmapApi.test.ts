import {
    RoadmapFollowProjectRequestSchema,
    RoadmapItemSchema,
    type RoadmapProjectResults,
    type RoadmapProjectRequestsResults,
} from '@lightdash/common';
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

    it.each([
        { slackThreadUrls: undefined },
        { slackThreadUrls: [] },
        {
            slackThreadUrls: [
                'https://customer.slack.com/archives/C123/p1789462222021839',
                'https://customer.slack.com/archives/G456/p1789462222021840?thread_ts=1789462222.021839',
            ],
        },
    ])(
        'preserves Slack links and defaults omitted fields: %j',
        async ({ slackThreadUrls }) => {
            const project = mockRoadmapProject('alpha');
            vi.mocked(lightdashApi).mockResolvedValue({
                ...mockRoadmapResults([project]),
                projects: [{ ...project, slackThreadUrls }],
            } as RoadmapProjectResults);
            expect(
                (await roadmapApi.getProjects({})).projects[0].slackThreadUrls,
            ).toEqual(slackThreadUrls ?? []);
            const request = RoadmapItemSchema.parse({
                ticketId: 'PROD-1',
                title: 'Request',
                description: null,
                status: 'Backlog',
                priority: 'Medium',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
                issueUrl: null,
                pullRequestUrl: null,
            });
            vi.mocked(lightdashApi).mockResolvedValue({
                data: [{ ...request, projectId: 'alpha', slackThreadUrls }],
                pagination: {
                    page: 1,
                    pageSize: 100,
                    totalIssues: 1,
                    totalPages: 1,
                },
                expiresAt: '2099-01-01T00:00:00Z',
                facets: {
                    statusCounts: {
                        Backlog: 1,
                        Building: 0,
                        Shipped: 0,
                        Canceled: 0,
                    },
                    priorityCounts: {
                        Urgent: 0,
                        High: 0,
                        Medium: 1,
                        Low: 0,
                        'No priority': 0,
                    },
                },
            } as RoadmapProjectRequestsResults);
            expect(
                (await roadmapApi.getRequests({ projectId: 'alpha' })).data[0]
                    .slackThreadUrls,
            ).toEqual(slackThreadUrls ?? []);
        },
    );

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
