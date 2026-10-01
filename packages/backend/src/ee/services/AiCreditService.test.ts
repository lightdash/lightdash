import { Ability } from '@casl/ability';
import {
    AiCreditsPausedError,
    FeatureFlags,
    ForbiddenError,
    type AiCreditContract,
    type AiCreditHold,
    type SessionUser,
} from '@lightdash/common';
import { buildAiCreditDailyUsage } from '../models/aiCreditDailyUsage';
import { emptyAccumulator } from '../models/AiCreditUsageModel';
import { AiCreditService } from './AiCreditService';

const now = new Date('2026-09-29T12:00:00Z');
const organizationUuid = 'org-1';

const contract = (
    overrides: Partial<AiCreditContract> = {},
): AiCreditContract => ({
    uuid: 'contract-1',
    organizationUuid,
    startsAt: new Date('2026-01-15T00:00:00Z'),
    endsAt: null,
    resetIntervalMonths: 1,
    allowanceCredits: 5_000,
    allowanceMode: 'warn',
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
    organizationContract = undefined as AiCreditContract | undefined,
    blockingHold = undefined as AiCreditHold | undefined,
} = {}) =>
    new AiCreditService({
        featureFlagModel: {
            get: vi.fn(async () => ({
                id: FeatureFlags.AiCredits,
                enabled: flagEnabled,
            })),
        },
        aiCreditUsageModel: {
            summarize: vi.fn(async () => ({
                ...emptyAccumulator(),
                billable: { credits: 120, tokens: 3_000_000, calls: 30 },
            })),
            summarizeByDay: vi.fn(
                async (_organizationUuid, period, breakdown) =>
                    buildAiCreditDailyUsage({
                        period,
                        breakdown,
                        entries: [],
                        names: null,
                    }),
            ),
        },
        aiCreditContractModel: {
            find: vi.fn(async () => organizationContract),
        },
        aiCreditHoldModel: {
            findActive: vi.fn(async () => []),
            findBlocking: vi.fn(async () => blockingHold),
        },
        siteUrl: 'https://app.example.com',
    });

const hold = (reason: AiCreditHold['reason']): AiCreditHold => ({
    uuid: 'hold-1',
    organizationUuid,
    userUuid: null,
    contractUuid: null,
    reason,
    notes: 'operator only',
    placedBy: 'operator@lightdash.com',
    placedAt: now,
    expiresAt: null,
    releasedAt: null,
});

describe('AiCreditService.getOrganizationUsage', () => {
    test('only organization admins may see usage', async () => {
        await expect(
            buildService().getOrganizationUsage(member(), now),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('is hidden until the ai-credits flag is on for the organization', async () => {
        await expect(
            buildService({ flagEnabled: false }).getOrganizationUsage(
                orgAdmin(),
                now,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('reports on the calendar month and does not say "credits" without a contract', async () => {
        const summary = await buildService().getOrganizationUsage(
            orgAdmin(),
            now,
        );
        expect(summary.period).toEqual({
            periodStart: new Date('2026-09-01T00:00:00Z'),
            periodEnd: new Date('2026-10-01T00:00:00Z'),
        });
        expect(summary.contract).toBeNull();
        expect(summary.canShowCredits).toBe(false);
    });

    test('reports on the contract window containing now', async () => {
        const summary = await buildService({
            organizationContract: contract(),
        }).getOrganizationUsage(orgAdmin(), now);
        expect(summary.period).toEqual({
            periodStart: new Date('2026-09-15T00:00:00Z'),
            periodEnd: new Date('2026-10-15T00:00:00Z'),
        });
        expect(summary.contract?.allowanceCredits).toBe(5_000);
        expect(summary.canShowCredits).toBe(true);
    });

    test('treats a contract that has ended as no contract', async () => {
        const summary = await buildService({
            organizationContract: contract({
                endsAt: new Date('2026-06-01T00:00:00Z'),
            }),
        }).getOrganizationUsage(orgAdmin(), now);
        expect(summary.contract).toBeNull();
        expect(summary.canShowCredits).toBe(false);
    });
});

describe('AiCreditService.getOrganizationDailyUsage', () => {
    test('only organization admins may see daily usage', async () => {
        await expect(
            buildService().getOrganizationDailyUsage(member(), 'user', now),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('is hidden until the ai-credits flag is on for the organization', async () => {
        await expect(
            buildService({ flagEnabled: false }).getOrganizationDailyUsage(
                orgAdmin(),
                'feature',
                now,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
    });

    test('covers every day of the contract window containing now', async () => {
        const usage = await buildService({
            organizationContract: contract(),
        }).getOrganizationDailyUsage(orgAdmin(), 'project', now);
        expect(usage.breakdown).toBe('project');
        expect(usage.days[0].date).toBe('2026-09-15');
        expect(usage.days.at(-1)?.date).toBe('2026-10-14');
        expect(usage.days).toHaveLength(30);
    });
});

describe('AiCreditService.assertAiCreditsAvailable', () => {
    const check = (
        service: AiCreditService,
        user: SessionUser,
        overrides: Partial<{
            keyManagement: 'lightdash-managed' | 'self-managed' | null;
            isEmbedViewer: boolean;
        }> = {},
    ) =>
        service.assertAiCreditsAvailable({
            user,
            resolveKeyManagement: async () =>
                overrides.keyManagement === undefined
                    ? 'lightdash-managed'
                    : overrides.keyManagement,
            isEmbedViewer: overrides.isEmbedViewer ?? false,
        });

    test('lets billable AI run while nothing pauses the organization', async () => {
        await expect(check(buildService(), member())).resolves.toBeUndefined();
    });

    test("never pauses AI that runs on the organization's own key", async () => {
        const service = buildService({ blockingHold: hold('manual_pause') });
        await expect(
            check(service, member(), { keyManagement: 'self-managed' }),
        ).resolves.toBeUndefined();
        await expect(
            check(service, member(), { keyManagement: null }),
        ).resolves.toBeUndefined();
    });

    test('refuses a member with the reason and a nudge to contact an admin', async () => {
        const error = await check(
            buildService({ blockingHold: hold('manual_pause') }),
            member(),
        ).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(AiCreditsPausedError);
        expect(error).toMatchObject({
            reason: 'manual_pause',
            statusCode: 403,
            message:
                'AI usage is paused for your organization. Contact an organization admin.',
        });
    });

    test('links admins to AI credits settings only while the page is enabled', async () => {
        await expect(
            check(
                buildService({ blockingHold: hold('allowance_exhausted') }),
                orgAdmin(),
            ),
        ).rejects.toThrow(
            "This period's AI credit allowance is used up. See AI credits settings: https://app.example.com/generalSettings/aiCredits",
        );
        await expect(
            check(
                buildService({
                    blockingHold: hold('allowance_exhausted'),
                    flagEnabled: false,
                }),
                orgAdmin(),
            ),
        ).rejects.toThrow(
            new AiCreditsPausedError({
                reason: 'allowance_exhausted',
                message: "This period's AI credit allowance is used up.",
            }),
        );
    });

    test('tells embedded viewers nothing about credits or operator notes', async () => {
        const error = await check(
            buildService({ blockingHold: hold('trial_ended') }),
            orgAdmin(),
            { isEmbedViewer: true },
        ).catch((e: unknown) => e);
        expect(error).toMatchObject({
            reason: 'trial_ended',
            message: "AI isn't available right now.",
        });
    });
});
