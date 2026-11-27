import {
    ApiConnectorType,
    getSalesforceDescribePath,
    getSalesforceEnvironment,
    isSalesforceInstanceOrigin,
    LIVE_INTEGRATION_CATALOG,
    ParameterError,
    SALESFORCE_LIMITS_PATH,
    SALESFORCE_OBJECTS,
    SALESFORCE_QUERY_PATH,
} from '@lightdash/common';
import { z } from 'zod';
import {
    formatTestCount,
    readRule,
    type LiveConnection,
    type LiveTestSummary,
} from '../../sdk';

// The setup test reads /limits, which has the org's daily API calls
const limitsSchema = z.object({
    DailyApiRequests: z.object({ Max: z.number(), Remaining: z.number() }),
});

// Or the object's describe, which lists its fields
const describeSchema = z.object({ fields: z.array(z.unknown()) });

export const summarizeSalesforceTest = (
    body: unknown,
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
            summary: 'Connected to your Salesforce org',
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

const CATALOG = LIVE_INTEGRATION_CATALOG[ApiConnectorType.SALESFORCE];

export const salesforceConnection: LiveConnection<ApiConnectorType.SALESFORCE> =
    {
        settings: CATALOG.settings,
        origins: ['https://<your domain>.my.salesforce.com'],
        acceptsOrigin: isSalesforceInstanceOrigin,
        access: () => ({
            rules: [
                readRule('GET', SALESFORCE_QUERY_PATH),
                ...SALESFORCE_OBJECTS.map((object) =>
                    readRule('GET', getSalesforceDescribePath(object)),
                ),
                readRule('GET', SALESFORCE_LIMITS_PATH),
            ],
        }),
        checkAuth: ({ type, oauthTokenUrl }) => {
            if (
                type !== 'oauth_authorization_code' ||
                getSalesforceEnvironment(oauthTokenUrl ?? null) === null
            ) {
                throw new ParameterError(
                    'Salesforce live data sources sign in with Salesforce',
                );
            }
        },
        describeTarget: () =>
            'Salesforce org: opportunities, accounts, leads and contacts',
        summarizeTest: summarizeSalesforceTest,
    };
