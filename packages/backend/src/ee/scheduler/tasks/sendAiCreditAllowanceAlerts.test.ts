import {
    type AiCreditContract,
    type OrganizationMemberProfile,
} from '@lightdash/common';
import { type AiCreditAllowanceAlert } from '../../models/AiCreditAllowanceAlertModel';
import { sendAiCreditAllowanceAlerts } from './sendAiCreditAllowanceAlerts';

const now = new Date('2026-09-29T12:00:00Z');
const organizationUuid = 'org-1';
const contract: AiCreditContract = {
    uuid: 'contract-1',
    organizationUuid,
    startsAt: new Date('2026-01-15T00:00:00Z'),
    endsAt: null,
    resetIntervalMonths: 1,
    allowanceCredits: 5000,
    allowanceMode: 'warn',
};

const alert = (
    overrides: Partial<AiCreditAllowanceAlert>,
): AiCreditAllowanceAlert => ({
    uuid: `alert-${overrides.thresholdPercent ?? 50}`,
    organizationUuid,
    contractUuid: contract.uuid,
    windowStart: new Date('2026-09-15T00:00:00Z'),
    thresholdPercent: 50,
    allowanceCredits: 5000,
    usedCredits: 2600,
    reachedAt: now,
    deliveredAt: null,
    ...overrides,
});

const admin = (email: string, isActive = true) =>
    ({
        userUuid: `user-${email}`,
        email,
        organizationUuid,
        isActive,
    }) as OrganizationMemberProfile;

const setup = ({
    pending,
    currentContract = contract,
}: {
    pending: AiCreditAllowanceAlert[];
    currentContract?: AiCreditContract;
}) => {
    const delivered: string[] = [];
    const inApp: { userUuids: string[]; message: string }[] = [];
    const run = sendAiCreditAllowanceAlerts({
        allowanceAlertModel: {
            findUndelivered: async () => pending,
            markDelivered: async (uuids) => {
                delivered.push(...uuids);
            },
        },
        contractModel: { find: async () => currentContract },
        organizationMemberProfileModel: {
            getOrganizationAdmins: async () => [
                admin('a@example.com'),
                admin('b@example.com'),
                admin('gone@example.com', false),
            ],
        },
        notificationsModel: {
            createAiCreditAllowanceNotifications: async ({
                userUuids,
                message,
            }) => {
                inApp.push({ userUuids, message });
            },
        },
        analytics: { track: () => undefined },
    });
    return { run: () => run(now), delivered, inApp };
};

describe('sendAiCreditAllowanceAlerts', () => {
    test('notifies each active admin once in the app', async () => {
        const { run, delivered, inApp } = setup({
            pending: [alert({ thresholdPercent: 80 })],
        });
        await run();

        expect(inApp).toHaveLength(1);
        expect(inApp[0].userUuids).toEqual([
            'user-a@example.com',
            'user-b@example.com',
        ]);
        expect(inApp[0].message).toBe(
            'Reached 80% of your AI credit allowance',
        );
        expect(delivered).toEqual(['alert-80']);
    });

    test('thresholds reached together send a single alert for the highest', async () => {
        const { run, delivered, inApp } = setup({
            pending: [
                alert({ thresholdPercent: 50 }),
                alert({ thresholdPercent: 80 }),
                alert({ thresholdPercent: 100 }),
            ],
        });
        await run();

        expect(inApp).toHaveLength(1);
        expect(inApp[0].message).toBe(
            'Reached 100% of your AI credit allowance',
        );
        expect(delivered).toEqual(['alert-50', 'alert-80', 'alert-100']);
    });

    test('sends nothing when the allowance changed after the threshold was reached', async () => {
        const { run, delivered, inApp } = setup({
            pending: [alert({ thresholdPercent: 50 })],
            currentContract: { ...contract, allowanceCredits: 10000 },
        });
        await run();

        expect(inApp).toEqual([]);
        expect(delivered).toEqual(['alert-50']);
    });

    test('sends nothing for a period that has already ended', async () => {
        const { run, inApp } = setup({
            pending: [
                alert({
                    thresholdPercent: 50,
                    windowStart: new Date('2026-08-15T00:00:00Z'),
                }),
            ],
        });
        await run();

        expect(inApp).toEqual([]);
    });
});
