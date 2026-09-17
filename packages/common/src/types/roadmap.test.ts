import { describe, expect, it } from 'vitest';
import {
    RoadmapFollowProjectRequestSchema,
    RoadmapFollowProjectResponseSchema,
    RoadmapFollowProjectResultsSchema,
    RoadmapItemSchema,
    RoadmapProjectQuerySchema,
    RoadmapProjectRequestsResponseSchema,
    RoadmapProjectRequestsResultsSchema,
    RoadmapProjectResponseSchema,
    RoadmapProjectResultsSchema,
    RoadmapResponseSchema,
} from './roadmap';

const urls = [
    'https://customer.slack.com/archives/C123/p1789462222021839',
    'https://customer.slack.com/archives/G456/p1789462222021840?thread_ts=1789462222.021839&cid=G456',
];
const item = {
    ticketId: 'PROD-1',
    title: 'Request',
    description: null,
    status: 'Backlog',
    priority: 'Medium',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    issueUrl: null,
    pullRequestUrl: null,
};
const group = {
    project: {
        projectId: 'project-1',
        title: 'Project',
        description: '',
        stage: 'planned',
        progress: 0,
        priority: 'Medium',
        issueStatusCounts: { Backlog: 1, Building: 0, Shipped: 0, Canceled: 0 },
        lastIssueUpdatedAt: null,
    },
    ownRequestCount: 1,
    hasDirectNeed: true,
};
const parseProject = (fields: Record<string, unknown>) =>
    RoadmapProjectResultsSchema.parse({
        projects: [{ ...group, ...fields }],
        otherRequestCount: 0,
        pagination: { page: 1, pageSize: 100, totalResults: 1, totalPages: 1 },
        expiresAt: '2099-01-01T00:00:00Z',
    }).projects[0];

describe('roadmap Slack thread contracts', () => {
    it.each([{}, { slackThreadUrls: [] }, { slackThreadUrls: urls }])(
        'accepts rollout-compatible fields %j without losing query parameters',
        (fields) => {
            const expected =
                'slackThreadUrls' in fields ? fields.slackThreadUrls : [];
            expect(
                RoadmapItemSchema.parse({ ...item, ...fields }).slackThreadUrls,
            ).toEqual(expected);
            const parsed = parseProject(fields);
            expect(parsed.slackThreadUrls).toEqual(expected);
            expect(parsed.project).not.toHaveProperty('slackThreadUrls');
        },
    );

    it.each(
        [
            null,
            'not-an-array',
            [null],
            ['not a URL'],
            [urls[0].replace('https:', 'http:')],
            [
                urls[0].replace(
                    'customer.slack.com',
                    'customer.slack.com.evil.test',
                ),
            ],
            [urls[0].replace('customer.slack.com', 'slack.com')],
            [
                urls[0].replace(
                    'customer.slack.com',
                    'user:password@customer.slack.com',
                ),
            ],
            [urls[0].replace('customer.slack.com', 'customer.slack.com:8443')],
            ['https://customer.slack.com/archives/C123'],
            ['https://customer.slack.com/redirect?url=https://example.com'],
        ].map((slackThreadUrls) => ({ slackThreadUrls })),
    )(
        'rejects invalid Slack thread fields $slackThreadUrls',
        ({ slackThreadUrls }) => {
            expect(() =>
                RoadmapItemSchema.parse({ ...item, slackThreadUrls }),
            ).toThrow();
            expect(() => parseProject({ slackThreadUrls })).toThrow();
        },
    );
});

describe('roadmap response compatibility', () => {
    const extraFields = { futureField: { value: 'ignored' } };

    it('accepts and strips additional fields throughout project responses', () => {
        const results = {
            projects: [group],
            otherRequestCount: 0,
            pagination: {
                page: 1,
                pageSize: 100,
                totalResults: 1,
                totalPages: 1,
            },
            expiresAt: '2099-01-01T00:00:00Z',
        };
        const extendedResults = {
            ...results,
            ...extraFields,
            pagination: { ...results.pagination, ...extraFields },
            projects: [
                {
                    ...group,
                    ...extraFields,
                    project: {
                        ...group.project,
                        ...extraFields,
                        issueStatusCounts: {
                            ...group.project.issueStatusCounts,
                            ...extraFields,
                        },
                    },
                },
            ],
        };
        expect(
            RoadmapProjectResponseSchema.parse({
                status: 'ok',
                results: extendedResults,
                ...extraFields,
            }),
        ).toEqual(
            RoadmapProjectResponseSchema.parse({ status: 'ok', results }),
        );
        expect(RoadmapProjectResultsSchema.parse(extendedResults)).toEqual(
            RoadmapProjectResultsSchema.parse(results),
        );
    });

    it('accepts and strips additional fields in filtered and unfiltered ticket responses', () => {
        const response = {
            status: 'ok',
            results: [{ ...item, projectId: 'project-1' }],
            pagination: {
                page: 1,
                pageSize: 100,
                totalIssues: 1,
                totalPages: 1,
            },
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
            expiresAt: '2099-01-01T00:00:00Z',
        };
        const extendedResponse = {
            ...response,
            ...extraFields,
            results: response.results.map((result) => ({
                ...result,
                ...extraFields,
            })),
            pagination: { ...response.pagination, ...extraFields },
            facets: {
                ...extraFields,
                statusCounts: {
                    ...response.facets.statusCounts,
                    ...extraFields,
                },
                priorityCounts: {
                    ...response.facets.priorityCounts,
                    ...extraFields,
                },
            },
        };
        for (const schema of [
            RoadmapResponseSchema,
            RoadmapProjectRequestsResponseSchema,
        ]) {
            expect(schema.parse(extendedResponse)).toEqual(
                schema.parse(response),
            );
        }
        expect(
            RoadmapProjectRequestsResultsSchema.parse({
                ...extendedResponse,
                data: extendedResponse.results,
            }),
        ).toEqual({
            data: response.results.map((result) => ({
                ...result,
                slackThreadUrls: [],
            })),
            pagination: response.pagination,
            facets: response.facets,
            expiresAt: response.expiresAt,
        });
    });

    it('accepts additional follow-confirmation fields while still validating known fields', () => {
        expect(
            RoadmapFollowProjectResponseSchema.parse({
                status: 'ok',
                ...extraFields,
                results: { message: 'Request received', ...extraFields },
            }),
        ).toEqual({ status: 'ok', results: { message: 'Request received' } });
        expect(
            RoadmapFollowProjectResultsSchema.parse({
                message: 'Request received',
                ...extraFields,
            }),
        ).toEqual({ message: 'Request received' });
        expect(
            RoadmapFollowProjectResultsSchema.safeParse({
                message: '',
                ...extraFields,
            }).success,
        ).toBe(false);
        expect(
            RoadmapItemSchema.safeParse({ ...item, title: 42, ...extraFields })
                .success,
        ).toBe(false);
    });

    it('keeps request and query validation strict', () => {
        expect(
            RoadmapProjectQuerySchema.safeParse({ page: 1, ...extraFields })
                .success,
        ).toBe(false);
        expect(
            RoadmapFollowProjectRequestSchema.safeParse({
                note: 'Please add this feature',
                ...extraFields,
            }).success,
        ).toBe(false);
    });
});
