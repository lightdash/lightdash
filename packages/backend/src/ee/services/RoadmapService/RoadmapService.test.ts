import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ForbiddenError,
    ParameterError,
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
}: { licenseKey?: string; flagEnabled?: boolean } = {}) =>
    new RoadmapService({
        lightdashConfig: {
            license: { licenseKey },
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

        await buildService().getRoadmap(account);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const requestedUrl = new URL(fetchMock.mock.calls[0][0]);
        expect(requestedUrl.pathname.endsWith(`/${sessionOrgUuid}`)).toBe(true);
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

    it('maps roadmap service errors to a stable server error', async () => {
        const account = buildAccount(viewRoadmapAbility(sessionOrgUuid));
        fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));

        await expect(buildService().getRoadmap(account)).rejects.toThrow(
            UnexpectedServerError,
        );
    });
});
