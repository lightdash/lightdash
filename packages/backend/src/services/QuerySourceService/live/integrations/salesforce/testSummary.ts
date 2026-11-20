import { z } from 'zod';
import { formatTestCount } from '../../integration';
import { type LiveTestSummary } from '../../types';

// The setup test reads /limits, which has the org's daily API calls
const limitsSchema = z.object({
    DailyApiRequests: z.object({ Max: z.number(), Remaining: z.number() }),
});

// Or the object's describe, which lists its fields
const describeSchema = z.object({ fields: z.array(z.unknown()) });

export const summarizeSalesforceTest = (
    body: unknown,
    { object }: { object: string },
): LiveTestSummary | null => {
    const limits = limitsSchema.safeParse(body);
    if (limits.success) {
        const { Max, Remaining } = limits.data.DailyApiRequests;
        return {
            summary: 'Connected to your Salesforce org',
            facts: [
                {
                    label: 'API calls left today',
                    value: `${formatTestCount(Remaining)} of ${formatTestCount(
                        Max,
                    )}`,
                },
            ],
        };
    }
    const describe = describeSchema.safeParse(body);
    if (describe.success) {
        return {
            summary: `Connected to Salesforce ${object}`,
            facts: [
                {
                    label: 'Fields',
                    value: formatTestCount(describe.data.fields.length),
                },
            ],
        };
    }
    return null;
};
