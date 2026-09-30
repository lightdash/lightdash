import { Ability } from '@casl/ability';
import {
    FeatureFlags,
    ForbiddenError,
    type AiCreditContract,
    type SessionUser,
} from '@lightdash/common';
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
        },
        aiCreditContractModel: {
            find: vi.fn(async () => organizationContract),
        },
        aiCreditHoldModel: { findActive: vi.fn(async () => []) },
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
