import { Ability, AbilityBuilder } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    LightdashMode,
    NotFoundError,
    UnexpectedServerError,
    type Account,
    type MemberAbility,
} from '@lightdash/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import { BillingService } from './BillingService';

const sessionOrgUuid = 'session-org-uuid';
const portalUrl = 'https://billing.example.com/portal?token=secret-token';

const buildAccount = (
    ability: MemberAbility,
    type: 'registered' | 'anonymous' = 'registered',
): Account =>
    ({
        authentication: { type: 'session', source: 'session-cookie' },
        organization: {
            organizationUuid: sessionOrgUuid,
            name: 'Org',
            createdAt: new Date(),
        },
        user: {
            id: 'user-uuid',
            userUuid: 'user-uuid',
            role: 'member',
            isActive: true,
            type,
            ability,
            abilityRules: ability.rules,
        },
        isAnonymousUser: () => type === 'anonymous',
        isAuthenticated: () => true,
        isJwtUser: () => type === 'anonymous',
        isOauthUser: () => false,
        isPatUser: () => false,
        isRegisteredUser: () => type === 'registered',
        isServiceAccount: () => false,
        isSessionUser: () => type === 'registered',
    }) as Account;

const manageBillingAbility = (organizationUuid: string): MemberAbility => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    builder.can('manage', 'Billing', { organizationUuid });
    return builder.build();
};

describe('BillingService', () => {
    const fetchMock = vi.fn();
    const getFlag = vi.fn();
    const warn = vi.fn();

    const buildService = ({
        licenseKey = 'test-license-key',
        mode = LightdashMode.CLOUD_BETA,
    }: { licenseKey?: string | null; mode?: LightdashMode } = {}) => {
        const service = new BillingService({
            analytics: analyticsMock,
            lightdashConfig: {
                mode,
                license: { licenseKey },
                roadmap: { baseUrl: 'http://127.0.0.1:8081' },
            } as LightdashConfig,
            featureFlagModel: { get: getFlag } as unknown as FeatureFlagModel,
        });
        Object.assign(service, {
            logger: { warn, debug: vi.fn(), info: vi.fn(), error: vi.fn() },
        });
        return service;
    };

    beforeEach(() => {
        getFlag.mockResolvedValue({
            id: FeatureFlags.BillingPortal,
            enabled: true,
        });
        fetchMock.mockImplementation(
            async () =>
                new Response(
                    JSON.stringify({
                        status: 'ok',
                        results: { url: portalUrl },
                    }),
                    { status: 200 },
                ),
        );
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('requests a link for the session organization with the instance license', async () => {
        const account = buildAccount(manageBillingAbility(sessionOrgUuid));

        await expect(buildService().createPortalLink(account)).resolves.toEqual(
            { url: portalUrl },
        );

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(
            `http://127.0.0.1:8081/api/v1/billing/organizations/${sessionOrgUuid}/portal-link`,
        );
        expect(init).toMatchObject({
            method: 'POST',
            redirect: 'manual',
            headers: { 'lightdash-license-key': 'test-license-key' },
        });
        expect(getFlag).toHaveBeenCalledWith({
            user: { organizationUuid: sessionOrgUuid, userUuid: 'user-uuid' },
            featureFlagId: FeatureFlags.BillingPortal,
        });
    });

    it('denies callers without billing access to their organization before any request', async () => {
        const service = buildService();

        await expect(
            service.createPortalLink(
                buildAccount(manageBillingAbility('other-org-uuid')),
            ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            service.createPortalLink(
                buildAccount(manageBillingAbility(sessionOrgUuid), 'anonymous'),
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(getFlag).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([LightdashMode.DEFAULT, LightdashMode.DEMO, LightdashMode.PR])(
        'is unavailable outside cloud and development modes (%s)',
        async (mode) => {
            await expect(
                buildService({ mode }).createPortalLink(
                    buildAccount(manageBillingAbility(sessionOrgUuid)),
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(getFlag).not.toHaveBeenCalled();
            expect(fetchMock).not.toHaveBeenCalled();
        },
    );

    it('is available in development mode', async () => {
        await expect(
            buildService({ mode: LightdashMode.DEV }).createPortalLink(
                buildAccount(manageBillingAbility(sessionOrgUuid)),
            ),
        ).resolves.toEqual({ url: portalUrl });
    });

    it('requires the feature flag and a license key before any request', async () => {
        const account = buildAccount(manageBillingAbility(sessionOrgUuid));

        getFlag.mockResolvedValueOnce({
            id: FeatureFlags.BillingPortal,
            enabled: false,
        });
        await expect(buildService().createPortalLink(account)).rejects.toThrow(
            ForbiddenError,
        );
        await expect(
            buildService({ licenseKey: null }).createPortalLink(account),
        ).rejects.toThrow(UnexpectedServerError);

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each([
        [401, ForbiddenError],
        [403, ForbiddenError],
        [404, NotFoundError],
        [302, UnexpectedServerError],
        [502, UnexpectedServerError],
    ])('maps an upstream %i to a stable error', async (status, expected) => {
        fetchMock.mockResolvedValueOnce(
            new Response(status === 302 ? null : 'private upstream detail', {
                status,
            }),
        );

        const error = await buildService()
            .createPortalLink(
                buildAccount(manageBillingAbility(sessionOrgUuid)),
            )
            .catch((e: unknown) => e);

        expect(error).toBeInstanceOf(expected);
        expect((error as Error).message).not.toContain('private');
    });

    it('rejects unreachable upstreams and non-https or malformed links without logging them', async () => {
        const account = buildAccount(manageBillingAbility(sessionOrgUuid));
        const service = buildService();

        fetchMock.mockRejectedValueOnce(new TypeError('private detail'));
        await expect(service.createPortalLink(account)).rejects.toThrow(
            UnexpectedServerError,
        );

        const invalidPayloads = [
            { status: 'ok', results: { url: 'data:text/html,portal' } },
            { status: 'ok', results: { url: 'http://billing.example.com' } },
            { status: 'ok', results: {} },
        ];
        await invalidPayloads.reduce(async (previous, payload) => {
            await previous;
            fetchMock.mockResolvedValueOnce(
                new Response(JSON.stringify(payload), { status: 200 }),
            );
            await expect(service.createPortalLink(account)).rejects.toThrow(
                UnexpectedServerError,
            );
        }, Promise.resolve());

        expect(JSON.stringify(warn.mock.calls)).not.toMatch(
            /private|data:|billing\.example/,
        );
    });
});
