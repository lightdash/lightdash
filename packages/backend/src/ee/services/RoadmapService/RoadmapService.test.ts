import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    RoadmapItemPriority,
    RoadmapItemStatus,
    RoadmapProjectRequestsResultsSchema,
    UnexpectedServerError,
    type Account,
    type MemberAbility,
    type RoadmapResponse,
} from '@lightdash/common';
import net from 'node:net';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import type { LightdashConfig } from '../../../config/parseConfig';
import { RoadmapService } from './RoadmapService';

const sessionOrgUuid = 'session-org-uuid';
const otherOrgUuid = 'other-org-uuid';
const slackThreadUrls = [
    'https://customer.slack.com/archives/C123/p1789462222021839',
    'https://customer.slack.com/archives/G456/p1789462222021840?thread_ts=1789462222.021839&cid=G456',
];

const buildAccount = (ability: MemberAbility): Account =>
    ({
        authentication: {
            type: 'session',
            source: 'session-cookie',
        },
        organization: {
            organizationUuid: sessionOrgUuid,
            name: 'Org',
            createdAt: new Date(),
        },
        user: {
            id: 'user-uuid',
            userUuid: 'user-uuid',
            userId: 1,
            email: 'user@example.com',
            firstName: 'Test',
            lastName: 'User',
            role: 'admin',
            type: 'registered',
            isActive: true,
            ability,
            abilityRules: ability.rules,
            isTrackingAnonymized: false,
            isMarketingOptedIn: false,
            isSetupComplete: true,
            createdAt: new Date(),
            updatedAt: new Date(),
            timezone: null,
        },
        isAnonymousUser: () => false,
        isAuthenticated: () => true,
        isJwtUser: () => false,
        isOauthUser: () => false,
        isPatUser: () => false,
        isRegisteredUser: () => true,
        isServiceAccount: () => false,
        isSessionUser: () => true,
    }) as Account;

const viewRoadmapAbility = (organizationUuid: string): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    builder.can('view', 'Roadmap', { organizationUuid });
    return builder.build();
};

const roadmapServiceResponse: RoadmapResponse = {
    status: 'ok',
    results: [],
    pagination: { page: 1, pageSize: 100, totalIssues: 0, totalPages: 0 },
    facets: {
        statusCounts: { Backlog: 0, Building: 0, Shipped: 0, Canceled: 0 },
        priorityCounts: {
            Urgent: 0,
            High: 0,
            Medium: 0,
            Low: 0,
            'No priority': 0,
        },
    },
};

const buildService = ({
    licenseKey = 'test-license-key',
    baseUrl = 'https://roadmap.lightdash.com',
}: { licenseKey?: string; baseUrl?: string } = {}) =>
    new RoadmapService({
        analytics: analyticsMock,
        lightdashConfig: {
            license: { licenseKey },
            roadmap: { baseUrl },
        } as LightdashConfig,
    });

describe('RoadmapService', () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockResolvedValue(
            new Response(JSON.stringify(roadmapServiceResponse), {
                status: 200,
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        vi.spyOn(net, 'createConnection').mockImplementation(() => {
            const socket = new net.Socket();
            process.nextTick(() =>
                socket.emit(
                    'error',
                    Object.assign(new Error('private TCP probe details'), {
                        code: 'ETIMEDOUT',
                        syscall: 'connect',
                    }),
                ),
            );
            return socket;
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    it('requests the roadmap for the organization on the account session', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));

        const result = await buildService().getRoadmap(account);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
        expect(requestedUrl.origin).toBe('https://roadmap.lightdash.com');
        expect(requestedUrl.pathname).toBe(
            `/api/v1/roadmap/organizations/${sessionOrgUuid}`,
        );
        expect(Object.fromEntries(requestedUrl.searchParams)).toEqual({
            pageSize: '100',
        });
        expect(result).toEqual({
            data: roadmapServiceResponse.results,
            pagination: roadmapServiceResponse.pagination,
            facets: roadmapServiceResponse.facets,
        });
    });

    it('rejects a caller-supplied organization identifier without contacting the roadmap service', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));

        await expect(
            buildService().getRoadmap(account, {
                organizationUuid: otherOrgUuid,
            } as never),
        ).rejects.toThrow(ParameterError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('uses the configured Control Center origin', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        await buildService({ baseUrl: 'http://127.0.0.1:8081' }).getRoadmap(
            account,
        );
        expect(fetchMock.mock.calls[0][0]).toBe(
            `http://127.0.0.1:8081/api/v1/roadmap/organizations/${sessionOrgUuid}?pageSize=100`,
        );
        fetchMock.mockRejectedValueOnce(
            new TypeError('private request details', {
                cause: { code: 'ENOTFOUND' },
            }),
        );
        await expect(
            buildService({ baseUrl: 'http://127.0.0.1:8081' }).getRoadmap(
                account,
            ),
        ).rejects.toMatchObject({
            message: 'Could not load the organization roadmap',
            data: {},
        });
    });

    it('denies access when the user cannot view the roadmap for their organization', async () => {
        const account = buildAccount(viewRoadmapAbility(otherOrgUuid));

        await expect(buildService().getRoadmap(account)).rejects.toThrow(
            ForbiddenError,
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fails without leaking detail when no license key is configured', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));

        await expect(
            buildService({ licenseKey: '' }).getRoadmap(account),
        ).rejects.toThrow(UnexpectedServerError);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([401, 403])(
        'maps roadmap service auth denial %s to Forbidden (org not bound)',
        async (status) => {
            const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
            fetchMock.mockResolvedValue(new Response('denied', { status }));

            await expect(
                buildService().getRoadmap(account),
            ).rejects.toMatchObject({
                name: 'ForbiddenError',
                statusCode: 403,
                data: {},
            });
        },
    );

    it.each([
        ...[
            'ENOTFOUND',
            'EAI_AGAIN',
            'ECONNREFUSED',
            'ENETUNREACH',
            'EHOSTUNREACH',
            'UND_ERR_CONNECT_TIMEOUT',
        ].map((code) => ({ code, message: 'private network details' })),
        ...['ETIMEDOUT', 'EACCES', 'EPERM'].map((code) => ({
            code,
            syscall: 'connect',
        })),
        new AggregateError(
            [
                { code: 'ENETUNREACH', syscall: 'connect' },
                { code: 'ETIMEDOUT', syscall: 'connect' },
            ],
            'private dual-stack details',
        ),
    ])(
        'provides network-egress guidance for DNS and connection failures (%#)',
        async (cause) => {
            const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
            fetchMock.mockRejectedValueOnce(
                new TypeError('private request details', { cause }),
            );

            await expect(
                buildService().getProjects(account),
            ).rejects.toMatchObject({
                name: 'UnexpectedServerError',
                statusCode: 500,
                message:
                    'The server cannot reach roadmap.lightdash.com. If you self-host, ask your administrator to allow outbound HTTPS (port 443) to roadmap.lightdash.com.',
                data: {
                    code: 'ROADMAP_UNREACHABLE',
                    documentationUrl:
                        'https://docs.lightdash.com/self-host/customize-deployment/organization-roadmap#network-egress',
                },
            });
        },
    );

    it.each([
        ...[404, 429, 500, 503].map((status) => ({
            status,
            body: 'private upstream details',
        })),
        { status: 200, body: 'not JSON' },
        { status: 200, body: JSON.stringify({ status: 'ok', results: {} }) },
    ])(
        'keeps upstream and invalid-response failures generic (%#)',
        async ({ status, body }) => {
            const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
            fetchMock.mockResolvedValue(new Response(body, { status }));

            const result = buildService().getRoadmap(account);
            await expect(result).rejects.toMatchObject({
                name: 'UnexpectedServerError',
                message: 'Could not load the organization roadmap',
            });
            await expect(result).rejects.toHaveProperty('data', {});
        },
    );

    it('bounds an unanswered TCP reachability probe and reports network-egress guidance', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        vi.useFakeTimers();
        vi.mocked(net.createConnection).mockImplementationOnce(
            () => new net.Socket(),
        );
        fetchMock.mockRejectedValueOnce(
            new TypeError('private timeout details', {
                cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
            }),
        );
        try {
            const result = buildService()
                .getProjects(account)
                .catch((error: unknown) => error);
            await vi.advanceTimersByTimeAsync(3_000);
            await expect(result).resolves.toHaveProperty(
                'data.code',
                'ROADMAP_UNREACHABLE',
            );
        } finally {
            vi.useRealTimers();
        }
    });

    it('treats redirects as upstream failures rather than diagnosing another domain as blocked roadmap egress', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        const dispatcher = getGlobalDispatcher();
        const agent = new MockAgent();
        agent.disableNetConnect();
        agent
            .get('https://roadmap.lightdash.com')
            .intercept({
                path: `/api/v1/roadmap/organizations/${sessionOrgUuid}?pageSize=100`,
            })
            .reply(302, '', {
                headers: {
                    location: 'https://unrelated.example.com/unavailable',
                },
            });
        agent
            .get('https://unrelated.example.com')
            .intercept({ path: '/unavailable' })
            .replyWithError(
                Object.assign(new Error('private upstream details'), {
                    code: 'ECONNREFUSED',
                }),
            );
        vi.unstubAllGlobals();
        setGlobalDispatcher(agent);
        try {
            const result = buildService().getRoadmap(account);
            await expect(result).rejects.toThrow(
                'Could not load the organization roadmap',
            );
            await expect(result).rejects.toHaveProperty('data', {});
        } finally {
            setGlobalDispatcher(dispatcher);
            await agent.close();
        }
    });

    it('keeps TLS-handshake timeouts generic when the roadmap TCP endpoint is reachable', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        const socket = new net.Socket();
        const connect = vi
            .spyOn(net, 'createConnection')
            .mockImplementationOnce(() => {
                process.nextTick(() => socket.emit('connect'));
                return socket;
            });
        fetchMock.mockRejectedValueOnce(
            new TypeError('private TLS handshake details', {
                cause: { code: 'UND_ERR_CONNECT_TIMEOUT' },
            }),
        );
        try {
            const result = buildService().getProjects(account);
            await expect(result).rejects.toThrow(
                'Could not load the organization roadmap',
            );
            await expect(result).rejects.toHaveProperty('data', {});
        } finally {
            connect.mockRestore();
            socket.destroy();
        }
    });

    it.each([
        new DOMException('private timeout details', 'TimeoutError'),
        new TypeError('private fetch details'),
        ...[
            { code: 'ECONNRESET' },
            { code: 'CERT_HAS_EXPIRED' },
            { code: 'UND_ERR_HEADERS_TIMEOUT' },
            { code: 'ETIMEDOUT' },
            { code: 'ETIMEDOUT', syscall: 'read' },
            { code: 'EACCES', syscall: 'read' },
            { code: 'ENOTFOUND', hostname: 'unrelated.example.com' },
            new AggregateError([], 'private aggregate details'),
            new AggregateError(
                [{ code: 'ENETUNREACH' }, { code: 'ECONNRESET' }],
                'private mixed details',
            ),
        ].map((cause) => new TypeError('private request details', { cause })),
    ])(
        'does not diagnose ambiguous timeouts, TLS, or unrelated fetch failures as blocked egress (%#)',
        async (error) => {
            const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
            fetchMock.mockRejectedValueOnce(error);

            const result = buildService().getProjects(account);
            await expect(result).rejects.toMatchObject({
                name: 'UnexpectedServerError',
                message: 'Could not load the organization roadmap',
            });
            await expect(result).rejects.toHaveProperty('data', {});
        },
    );
    it('project reads use session identity, sends bounded filters, and validates live metadata without changing v1', async () => {
        const results = {
            projects: [
                {
                    project: {
                        projectId: 'project-1',
                        title: 'Filters',
                        description:
                            'Filter dashboards using reusable controls.',
                        stage: 'completed',
                        progress: 100,
                        priority: 'High',
                        issueStatusCounts: {
                            Backlog: 8,
                            Building: 3,
                            Shipped: 12,
                            Canceled: 1,
                        },
                        lastIssueUpdatedAt: '2026-09-09T09:30:00Z',
                    },
                    ownRequestCount: 2,
                    hasDirectNeed: false,
                    slackThreadUrls,
                },
            ],
            otherRequestCount: 1,
            pagination: {
                page: 1,
                pageSize: 10,
                totalResults: 1,
                totalPages: 1,
            },
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'ok',
                    extraMetadata: 'ignored',
                    results: {
                        ...results,
                        extraMetadata: 'ignored',
                        projects: results.projects.map((group) => ({
                            ...group,
                            extraMetadata: 'ignored',
                            project: {
                                ...group.project,
                                extraMetadata: 'ignored',
                            },
                        })),
                    },
                }),
            ),
        );
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        expect(
            await buildService().getProjects(account, {
                pageSize: 10,
                search: 'Filters',
                onlyInterested: true,
            }),
        ).toEqual(results);
        const url = new URL(fetchMock.mock.calls[0][0]);
        expect(url.pathname).toBe(
            `/api/v1/roadmap/organizations/${sessionOrgUuid}/projects`,
        );
        expect(url.searchParams.get('onlyInterested')).toBe('true');
        expect(url.searchParams.get('pageSize')).toBe('10');
        expect(fetchMock.mock.calls[0][1].headers).toEqual({
            'lightdash-license-key': 'test-license-key',
        });
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({
                    status: 'ok',
                    results: {
                        ...results,
                        projects: [
                            {
                                ...results.projects[0],
                                slackThreadUrls: undefined,
                            },
                        ],
                    },
                }),
            ),
        );
        expect(
            (await buildService().getProjects(account)).projects[0]
                .slackThreadUrls,
        ).toEqual([]);
        fetchMock.mockClear();
        await expect(
            buildService().getProjects(account, {
                organizationUuid: otherOrgUuid,
            } as never),
        ).rejects.toThrow(ParameterError);
        await expect(
            buildService().getRoadmap(account, {
                projectId: 'p',
                customerId: 'foreign',
            } as never),
        ).rejects.toThrow(ParameterError);
        expect(fetchMock).not.toHaveBeenCalled();
        const invalidPayloads = [
            ...[
                { issueStatusCounts: { Backlog: 1 } },
                {
                    issueStatusCounts: {
                        ...results.projects[0].project.issueStatusCounts,
                        Building: -1,
                    },
                },
                { lastIssueUpdatedAt: 'not-a-date' },
            ].map((projectFields) => ({
                status: 'ok',
                results: {
                    ...results,
                    projects: [
                        {
                            ...results.projects[0],
                            project: {
                                ...results.projects[0].project,
                                ...projectFields,
                            },
                        },
                    ],
                },
            })),
            {
                status: 'ok',
                results: {
                    ...results,
                    expiresAt: new Date(Date.now() - 1).toISOString(),
                },
            },
            roadmapServiceResponse,
        ];
        invalidPayloads.forEach((payload) =>
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify(payload)),
            ),
        );
        await Promise.all(
            invalidPayloads.map(() =>
                expect(buildService().getProjects(account)).rejects.toThrow(
                    UnexpectedServerError,
                ),
            ),
        );
        const resultsWithoutActivity = {
            ...results,
            projects: [
                {
                    ...results.projects[0],
                    project: {
                        ...results.projects[0].project,
                        issueStatusCounts: {
                            Backlog: 0,
                            Building: 0,
                            Shipped: 0,
                            Canceled: 0,
                        },
                        lastIssueUpdatedAt: null,
                    },
                },
            ],
        };
        fetchMock.mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    status: 'ok',
                    results: resultsWithoutActivity,
                }),
            ),
        );
        await expect(buildService().getProjects(account)).resolves.toEqual(
            resultsWithoutActivity,
        );
    });

    it('gates both endpoints before provider requests and keeps authorization errors stable', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        await Promise.all(
            [buildService({ licenseKey: '' })].map(async (service) => {
                await expect(service.getProjects(account)).rejects.toThrow();
                await expect(
                    service.getRoadmap(account, { projectId: 'null' }),
                ).rejects.toThrow();
            }),
        );
        const deniedAccount = buildAccount(viewRoadmapAbility(otherOrgUuid));
        await expect(buildService().getProjects(deniedAccount)).rejects.toThrow(
            ForbiddenError,
        );
        await expect(
            buildService().getRoadmap(deniedAccount, { projectId: 'p' }),
        ).rejects.toThrow(ForbiddenError);
        expect(fetchMock).not.toHaveBeenCalled();
        fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
        await expect(
            buildService().getRoadmap(account, { projectId: 'p' }),
        ).rejects.toThrow(ForbiddenError);
    });

    it.each(['project-1', 'null', 'other'])(
        'requests filtered issues using projectId=%s and preserves their response metadata',
        async (projectId) => {
            const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
            const response = {
                ...roadmapServiceResponse,
                results: [
                    {
                        ticketId: 'PROD-1',
                        title: 'Filters',
                        description: null,
                        status: RoadmapItemStatus.BUILDING,
                        priority: RoadmapItemPriority.HIGH,
                        createdAt: '2026-01-01T00:00:00Z',
                        updatedAt: '2026-09-01T00:00:00Z',
                        issueUrl:
                            'https://github.com/lightdash/lightdash/issues/1',
                        pullRequestUrl: null,
                        slackThreadUrls,
                        projectId: projectId === 'null' ? null : projectId,
                    },
                ],
                pagination: {
                    page: 2,
                    pageSize: 20,
                    totalIssues: 21,
                    totalPages: 2,
                },
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
            };
            fetchMock.mockResolvedValue(
                new Response(
                    JSON.stringify({
                        ...response,
                        extraMetadata: 'ignored',
                        results: response.results.map((item) => ({
                            ...item,
                            extraMetadata: 'ignored',
                        })),
                    }),
                ),
            );
            const result = await buildService().getRoadmap(account, {
                projectId,
                page: 2,
                pageSize: 20,
                search: 'Filters & charts',
                statuses: 'started,paused',
                priorities: 'High,No priority',
            });
            const url = new URL(fetchMock.mock.calls[0][0]);
            expect(url.pathname).toBe(
                `/api/v1/roadmap/organizations/${sessionOrgUuid}`,
            );
            expect(Object.fromEntries(url.searchParams)).toEqual({
                projectId,
                page: '2',
                pageSize: '20',
                search: 'Filters & charts',
                statuses: 'started,paused',
                priorities: 'High,No priority',
            });
            expect(fetchMock.mock.calls[0][1].headers).toEqual({
                'lightdash-license-key': 'test-license-key',
            });
            expect(RoadmapProjectRequestsResultsSchema.parse(result)).toEqual({
                data: response.results,
                pagination: response.pagination,
                facets: response.facets,
                expiresAt: response.expiresAt,
            });
            fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
            expect(
                (await buildService().getRoadmap(account)).data[0]
                    .slackThreadUrls,
            ).toEqual(slackThreadUrls);
            fetchMock.mockResolvedValue(
                new Response(
                    JSON.stringify({
                        ...response,
                        results: [
                            {
                                ...response.results[0],
                                slackThreadUrls: undefined,
                            },
                        ],
                    }),
                ),
            );
            expect(
                (await buildService().getRoadmap(account, { projectId }))
                    .data[0].slackThreadUrls,
            ).toEqual([]);
        },
    );

    it('rejects filtered responses with missing or expired freshness metadata and invalid shapes', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        const fresh = {
            ...roadmapServiceResponse,
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
        const responses = [
            roadmapServiceResponse,
            { ...fresh, expiresAt: new Date().toISOString() },
            {
                status: 'ok',
                results: { requests: [], expiresAt: fresh.expiresAt },
            },
        ];
        responses.forEach((response) =>
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify(response)),
            ),
        );
        await Promise.all(
            responses.map(() =>
                expect(
                    buildService().getRoadmap(account, { projectId: 'null' }),
                ).rejects.toThrow(UnexpectedServerError),
            ),
        );
    });

    it.each([
        { groupId: 'other' },
        { projectId: '' },
        { projectId: 'p', onlyInterested: true },
        { projectId: 'p', customerId: otherOrgUuid },
        { statuses: 'unknown' },
        { priorities: 'critical' },
    ])(
        'rejects unsupported issue queries before contacting Control Center: %j',
        async (query) => {
            const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
            await expect(
                buildService().getRoadmap(account, query as never),
            ).rejects.toThrow(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );
    describe('followProject', () => {
        const projectId = '9333377a-b301-4e30-a244-5ad5ea3cdc6e';
        const userUuid = 'ae3aef51-a909-4d3d-a80f-bc5b68918b5f';
        const confirmation = {
            status: 'ok',
            results: {
                message:
                    'The request has been sent to the Lightdash team and will soon be reviewed',
            },
        };
        const account = () => {
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            buildAbilityFromScopes(
                {
                    organizationUuid: sessionOrgUuid,
                    userUuid,
                    isEnterprise: true,
                    scopes: ['view:Roadmap', 'manage:Roadmap'],
                },
                builder,
            );
            const value = buildAccount(builder.build());
            return { ...value, user: { ...value.user, userUuid } } as Account;
        };

        it('sends trusted identity and a trimmed note to the configured follow endpoint', async () => {
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify(confirmation)),
            );
            const result = await buildService({
                baseUrl: 'http://localhost:8082',
            }).followProject(account(), projectId, {
                note: '  Our use case  ',
            });
            expect(result).toEqual(confirmation.results);
            const [url, options] = fetchMock.mock.calls[0];
            expect(url).toBe(
                `http://localhost:8082/api/v1/roadmap/organizations/${sessionOrgUuid}/projects/${projectId}/follow`,
            );
            expect(options.method).toBe('POST');
            expect(options.headers).toEqual({
                'lightdash-license-key': 'test-license-key',
                'Content-Type': 'application/json',
            });
            expect(JSON.parse(options.body)).toEqual({
                organizationName: 'Org',
                user: {
                    userUuid,
                    name: 'Test User',
                    email: 'user@example.com',
                },
                note: 'Our use case',
            });
            expect(options.signal).toBeInstanceOf(AbortSignal);
            expect(fetchMock).toHaveBeenCalledOnce();
        });

        it.each([
            { note: '' },
            { note: '   ' },
            { note: 'a'.repeat(2001) },
            { note: 'Use case', organizationUuid: otherOrgUuid },
            { note: 'Use case', organizationName: 'Spoofed org' },
            { note: 'Use case', user: { email: 'attacker@example.com' } },
        ])(
            'rejects invalid notes and caller-supplied identity: %j',
            async (body) => {
                await expect(
                    buildService().followProject(account(), projectId, body),
                ).rejects.toThrow(ParameterError);
                expect(fetchMock).not.toHaveBeenCalled();
            },
        );

        it('rejects non-UUID project IDs before fetching', async () => {
            await expect(
                buildService().followProject(account(), '../projects', {
                    note: 'Use case',
                }),
            ).rejects.toThrow(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('allows a non-admin with the organization scope', async () => {
            const customRoleAccount = account();
            customRoleAccount.user = {
                ...customRoleAccount.user,
                role: OrganizationMemberRole.MEMBER,
            } as typeof customRoleAccount.user;
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify(confirmation)),
            );
            await expect(
                buildService().followProject(customRoleAccount, projectId, {
                    note: 'Use case',
                }),
            ).resolves.toEqual(confirmation.results);
        });

        it('allows service accounts with the scope and required identity', async () => {
            const serviceAccount = account();
            serviceAccount.isServiceAccount = (() =>
                true) as typeof serviceAccount.isServiceAccount;
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify(confirmation)),
            );
            await expect(
                buildService().followProject(serviceAccount, projectId, {
                    note: 'Use case',
                }),
            ).resolves.toEqual(confirmation.results);
        });

        it('denies view-only accounts even when their stored role is admin', async () => {
            const viewer = account();
            viewer.user.ability = viewRoadmapAbility(sessionOrgUuid);
            viewer.user.abilityRules = viewer.user.ability.rules;
            await expect(
                buildService().followProject(viewer, projectId, {
                    note: 'Use case',
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('denies management grants belonging to another organization', async () => {
            const wrongOrg = account();
            const builder = new AbilityBuilder<MemberAbility>(Ability);
            builder.can('view', 'Roadmap', {
                organizationUuid: sessionOrgUuid,
            });
            builder.can('manage', 'Roadmap', {
                organizationUuid: otherOrgUuid,
            });
            wrongOrg.user.ability = builder.build();
            wrongOrg.user.abilityRules = wrongOrg.user.ability.rules;
            await expect(
                buildService().followProject(wrongOrg, projectId, {
                    note: 'Use case',
                }),
            ).rejects.toThrow(ForbiddenError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('requires roadmap access and a configured license key', async () => {
            const wrongOrg = account();
            wrongOrg.user.ability = viewRoadmapAbility(otherOrgUuid);
            wrongOrg.user.abilityRules = wrongOrg.user.ability.rules;
            await expect(
                buildService().followProject(wrongOrg, projectId, {
                    note: 'Use case',
                }),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                buildService({ licenseKey: '' }).followProject(
                    account(),
                    projectId,
                    { note: 'Use case' },
                ),
            ).rejects.toThrow(UnexpectedServerError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('requires complete trusted identity before forwarding', async () => {
            const missingEmail = account();
            missingEmail.user.email = undefined;
            await expect(
                buildService().followProject(missingEmail, projectId, {
                    note: 'Use case',
                }),
            ).rejects.toThrow(ParameterError);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it.each([201, 202, 401, 403, 404, 429, 500, 502, 503])(
            'handles upstream %s without retrying or exposing its body',
            async (status) => {
                fetchMock.mockResolvedValueOnce(
                    new Response('private note and provider details', {
                        status,
                    }),
                );
                const result = buildService().followProject(
                    account(),
                    projectId,
                    { note: 'Use case' },
                );
                const errorType =
                    new Map([
                        [401, ForbiddenError],
                        [403, ForbiddenError],
                        [404, NotFoundError],
                    ]).get(status) ?? UnexpectedServerError;
                await expect(result).rejects.toThrow(errorType);
                await expect(result).rejects.not.toThrow('private note');
                expect(fetchMock).toHaveBeenCalledOnce();
            },
        );

        it.each([
            'not JSON',
            JSON.stringify({ status: 'ok', results: { hasDirectNeed: true } }),
        ])('rejects malformed confirmation %s', async (body) => {
            fetchMock.mockResolvedValueOnce(new Response(body));
            await expect(
                buildService().followProject(account(), projectId, {
                    note: 'Use case',
                }),
            ).rejects.toThrow(UnexpectedServerError);
        });

        it.each([
            {
                error: new DOMException(
                    'private timeout details',
                    'TimeoutError',
                ),
                errorName: 'TimeoutError',
                errorCode: undefined,
            },
            ...['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].map((code) => ({
                error: new TypeError('private request details', {
                    cause: { code, message: 'private provider details' },
                }),
                errorName: 'TypeError',
                errorCode: code,
            })),
            {
                error: 'private thrown value',
                errorName: 'UnknownError',
                errorCode: undefined,
            },
        ])(
            'logs safe network diagnostics without retrying: $errorName $errorCode',
            async ({ error, errorName, errorCode }) => {
                const service = buildService();
                const warn = vi.spyOn(service['logger'], 'warn');
                fetchMock.mockRejectedValueOnce(error);
                await expect(
                    service.followProject(account(), projectId, {
                        note: 'Use case',
                    }),
                ).rejects.toThrow(UnexpectedServerError);
                expect(warn).toHaveBeenCalledExactlyOnceWith(
                    'Could not reach the roadmap service',
                    { errorName, errorCode },
                );
                expect(JSON.stringify(warn.mock.calls)).not.toContain(
                    'private',
                );
                expect(fetchMock).toHaveBeenCalledOnce();
                warn.mockRestore();
            },
        );
    });
});
