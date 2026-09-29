import { isAiUsageBillable } from './AiCreditUsageModel';

describe('isAiUsageBillable', () => {
    test('charges only completed calls on a Lightdash-managed key for billable features', () => {
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyManagement: 'lightdash-managed',
                outcome: 'complete',
            }),
        ).toBe(true);
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyManagement: 'self-managed',
                outcome: 'complete',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'data-app',
                keyManagement: 'lightdash-managed',
                outcome: 'failed',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'review-classifier',
                keyManagement: 'lightdash-managed',
                outcome: 'complete',
            }),
        ).toBe(false);
        expect(
            isAiUsageBillable({
                feature: 'agent',
                keyManagement: null,
                outcome: 'complete',
            }),
        ).toBe(false);
    });
});
