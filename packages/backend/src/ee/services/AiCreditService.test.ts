import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    type AiCreditEntitlement,
    type SessionUser,
} from '@lightdash/common';
import { emptyAccumulator } from '../models/AiCreditUsageModel';
import { AiCreditService, selectReportingPeriod } from './AiCreditService';

const now = new Date('2026-09-29T12:00:00Z');
const organizationUuid = 'org-1';

const entitlement = (
    overrides: Partial<AiCreditEntitlement> = {},
): AiCreditEntitlement => ({
    uuid: 'ent-1',
    organizationUuid,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    allowanceCredits: 5_000,
    ...overrides,
});

const userWith = (rules: Ability['rules']): SessionUser =>
    ({
        userUuid: 'user-1',
        organizationUuid,
        ability: new Ability(rules),
        abilityRules: rules,
    }) as unknown as SessionUser;

const orgAdmin = () =>
    userWith([{ action: 'manage', subject: 'Organization' }]);
const member = () => userWith([{ action: 'view', subject: 'Organization' }]);

const buildService = ({
    flagEnabled = true,
    licenseKey = 'licence' as string | null,
    entitlements = [] as AiCreditEntitlement[],
} = {}) => {
    const featureFlagModel = {
        get: vi.fn(async () => ({
            id: FeatureFlags.AiCredits,
            enabled: flagEnabled,
        })),
    };
    const summarize = vi.fn(async () => ({
        ...emptyAccumulator(),
        billable: { credits: 120, tokens: 3_000_000, calls: 30 },
    }));
    const sumCredits = vi.fn(async () => 900);
    const service = new AiCreditService({
        lightdashConfig: { license: { licenseKey, licenseCertificate: null } },
        featureFlagModel,
        aiCreditUsageModel: { summarize, sumCredits },
        aiCreditEntitlementModel: {
            findCovering: vi.fn(async () => entitlements),
        },
        aiCreditHoldModel: { findActive: vi.fn(async () => []) },
    });
    return { service, summarize, sumCredits, featureFlagModel };
};

describe('AiCreditService.getOrganizationUsage', () => {
    test('only organization admins may see usage', async () => {
        const { service } = buildService();
        await expect(
            service.getOrganizationUsage(member(), now),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('is hidden until the ai-credits flag is on for the organization', async () => {
        const { service, featureFlagModel } = buildService({
            flagEnabled: false,
        });
        await expect(
            service.getOrganizationUsage(orgAdmin(), now),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(featureFlagModel.get).toHaveBeenCalledWith(
            expect.objectContaining({ featureFlagId: FeatureFlags.AiCredits }),
        );
    });

    test('says "credits" only on a licensed instance with an entitlement', async () => {
        const unlicensed = buildService({
            licenseKey: null,
            entitlements: [entitlement()],
        });
        const noEntitlement = buildService();
        const both = buildService({ entitlements: [entitlement()] });

        expect(
            (await unlicensed.service.getOrganizationUsage(orgAdmin(), now))
                .canShowCredits,
        ).toBe(false);
        expect(
            (await noEntitlement.service.getOrganizationUsage(orgAdmin(), now))
                .canShowCredits,
        ).toBe(false);
        expect(
            (await both.service.getOrganizationUsage(orgAdmin(), now))
                .canShowCredits,
        ).toBe(true);
    });

    test('reports on the calendar month when no entitlement covers now', async () => {
        const { service } = buildService();
        const summary = await service.getOrganizationUsage(orgAdmin(), now);
        expect(summary.period.periodStart.toISOString()).toBe(
            '2026-09-01T00:00:00.000Z',
        );
        expect(summary.period.periodEnd.toISOString()).toBe(
            '2026-10-01T00:00:00.000Z',
        );
        expect(summary.entitlements).toEqual([]);
    });

    test('reports on the shortest covering entitlement and gives each its own used credits', async () => {
        const monthly = entitlement({ uuid: 'monthly' });
        const annual = entitlement({
            uuid: 'annual',
            periodStart: new Date('2026-01-01T00:00:00Z'),
            periodEnd: new Date('2027-01-01T00:00:00Z'),
            allowanceCredits: 60_000,
        });
        const { service, sumCredits } = buildService({
            entitlements: [annual, monthly],
        });

        const summary = await service.getOrganizationUsage(orgAdmin(), now);

        expect(summary.period).toEqual({
            periodStart: monthly.periodStart,
            periodEnd: monthly.periodEnd,
        });
        expect(summary.entitlements).toEqual([
            expect.objectContaining({ uuid: 'annual', usedCredits: 900 }),
            expect.objectContaining({ uuid: 'monthly', usedCredits: 120 }),
        ]);
        // The monthly figure comes from the summary already computed; only the annual period is summed again.
        expect(sumCredits).toHaveBeenCalledTimes(1);
    });
});

describe('selectReportingPeriod', () => {
    test('prefers the shortest overlapping entitlement', () => {
        const short = entitlement({ uuid: 'short' });
        const long = entitlement({
            uuid: 'long',
            periodStart: new Date('2026-01-01T00:00:00Z'),
            periodEnd: new Date('2027-01-01T00:00:00Z'),
        });
        expect(selectReportingPeriod([long, short], now)).toBe(short);
    });
});
