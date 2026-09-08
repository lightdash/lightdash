import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
    RoadmapItemPriority,
    RoadmapItemStatus,
    RoadmapProjectRequestsResultsSchema,
    UnexpectedServerError,
    type Account,
    type MemberAbility,
    type RoadmapResponse,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightdashConfig } from '../../../config/parseConfig';
import { RoadmapService } from './RoadmapService';

const sessionOrgUuid = 'session-org-uuid';
const otherOrgUuid = 'other-org-uuid';

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
    flagEnabled = true,
    baseUrl = 'https://roadmap.lightdash.com',
}: { licenseKey?: string; flagEnabled?: boolean; baseUrl?: string } = {}) =>
    new RoadmapService({
        lightdashConfig: {
            license: { licenseKey },
            roadmap: { baseUrl },
        } as LightdashConfig,
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: flagEnabled }),
        },
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
    });

    afterEach(() => {
        vi.unstubAllGlobals();
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
    });

    it('denies access when the feature flag is disabled', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));

        await expect(
            buildService({ flagEnabled: false }).getRoadmap(account),
        ).rejects.toThrow(ForbiddenError);
        expect(fetchMock).not.toHaveBeenCalled();
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

    it('maps a roadmap service auth denial to Forbidden (org not bound)', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));

        await expect(buildService().getRoadmap(account)).rejects.toThrow(
            ForbiddenError,
        );
    });

    it('maps other roadmap service errors to a stable server error', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        fetchMock.mockResolvedValue(new Response('boom', { status: 500 }));

        await expect(buildService().getRoadmap(account)).rejects.toThrow(
            UnexpectedServerError,
        );
    });
    it('project reads use session identity, sends bounded filters, and validates live metadata without changing v1', async () => {
        const results = {
            projects: [
                {
                    project: {
                        projectId: 'project-1',
                        title: 'Filters',
                        stage: 'completed',
                        progress: 100,
                        priority: 'High',
                    },
                    ownRequestCount: 2,
                    hasDirectNeed: false,
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
            new Response(JSON.stringify({ status: 'ok', results })),
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
            {
                status: 'ok',
                results: {
                    ...results,
                    expiresAt: new Date(Date.now() - 1).toISOString(),
                },
            },
            { status: 'ok', results: { ...results, customerName: 'private' } },
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
    });

    it('gates both endpoints before provider requests and keeps authorization errors stable', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        await Promise.all(
            [
                buildService({ flagEnabled: false }),
                buildService({ licenseKey: '' }),
            ].map(async (service) => {
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
            fetchMock.mockResolvedValue(new Response(JSON.stringify(response)));
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
        },
    );

    it('rejects filtered responses with missing or expired freshness metadata and private fields', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        const fresh = {
            ...roadmapServiceResponse,
            expiresAt: new Date(Date.now() + 600_000).toISOString(),
        };
        const responses = [
            roadmapServiceResponse,
            { ...fresh, expiresAt: new Date().toISOString() },
            { ...fresh, customerName: 'private' },
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
});
