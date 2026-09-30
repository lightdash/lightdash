import {
    getAiCreditAllowanceAlertMessage,
    isAiCreditAllowanceAlertPlanSettled,
    planAiCreditAllowanceAlerts,
} from './allowanceAlerts';

describe('planAiCreditAllowanceAlerts', () => {
    test('reaches nothing below half the allowance', () => {
        expect(
            planAiCreditAllowanceAlerts({
                usedCredits: 2499,
                allowanceCredits: 5000,
                records: [],
            }),
        ).toEqual({ reached: [], rearmed: [], carriedOver: [] });
    });

    test('reaches every threshold usage has crossed, including exactly 100%', () => {
        expect(
            planAiCreditAllowanceAlerts({
                usedCredits: 5000,
                allowanceCredits: 5000,
                records: [],
            }).reached,
        ).toEqual([50, 80, 100]);
    });

    test('a threshold already alerted in the period does not alert again', () => {
        expect(
            planAiCreditAllowanceAlerts({
                usedCredits: 4100,
                allowanceCredits: 5000,
                records: [{ thresholdPercent: 50, allowanceCredits: 5000 }],
            }).reached,
        ).toEqual([80]);
    });

    test('raising the allowance above usage re-arms the thresholds usage is now below', () => {
        expect(
            planAiCreditAllowanceAlerts({
                usedCredits: 4500,
                allowanceCredits: 10000,
                records: [
                    { thresholdPercent: 50, allowanceCredits: 5000 },
                    { thresholdPercent: 80, allowanceCredits: 5000 },
                ],
            }),
        ).toEqual({ reached: [], rearmed: [50, 80], carriedOver: [] });
    });

    test('a changed allowance that usage still exceeds does not alert again', () => {
        expect(
            planAiCreditAllowanceAlerts({
                usedCredits: 4500,
                allowanceCredits: 6000,
                records: [{ thresholdPercent: 50, allowanceCredits: 5000 }],
            }),
        ).toEqual({ reached: [], rearmed: [], carriedOver: [50] });
    });
});

describe('getAiCreditAllowanceAlertMessage', () => {
    test('names the threshold reached', () => {
        expect(getAiCreditAllowanceAlertMessage(80)).toBe(
            'Reached 80% of your AI credit allowance',
        );
    });
});

describe('isAiCreditAllowanceAlertPlanSettled', () => {
    test('is settled only when every threshold was recorded against the current allowance', () => {
        const all = [50, 80, 100] as const;
        expect(
            isAiCreditAllowanceAlertPlanSettled(
                all.map((thresholdPercent) => ({
                    thresholdPercent,
                    allowanceCredits: 5000,
                })),
                5000,
            ),
        ).toBe(true);
        expect(
            isAiCreditAllowanceAlertPlanSettled(
                all.map((thresholdPercent) => ({
                    thresholdPercent,
                    allowanceCredits: 5000,
                })),
                6000,
            ),
        ).toBe(false);
    });
});
