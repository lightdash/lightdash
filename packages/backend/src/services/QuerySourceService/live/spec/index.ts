import { ApiConnectorType } from '@lightdash/common';
import { attioSpec } from '../integrations/attio/spec';
import { ga4Spec } from '../integrations/ga4/spec';
import { githubSpec } from '../integrations/github/spec';
import { googleAdsSpec } from '../integrations/googleAds/spec';
import { hubspotSpec } from '../integrations/hubspot/spec';
import { linkedInAdsSpec } from '../integrations/linkedInAds/spec';
import { metaAdsSpec } from '../integrations/metaAds/spec';
import { postHogSpec } from '../integrations/postHog/spec';
import { pylonSpec } from '../integrations/pylon/spec';
import { salesforceSpec } from '../integrations/salesforce/spec';
import { searchConsoleSpec } from '../integrations/searchConsole/spec';
import { youtubeAnalyticsSpec } from '../integrations/youtubeAnalytics/spec';
import { getLiveIntegration } from '../registry';
import { type LiveAuthNeed, type LiveIntegrationSpec } from './types';

export { crossToolSpec } from './crossTool';

/** One spec per integration; a missing one fails typecheck. */
export const LIVE_SPECS: { [C in ApiConnectorType]: LiveIntegrationSpec } = {
    [ApiConnectorType.GA4]: ga4Spec,
    [ApiConnectorType.SEARCH_CONSOLE]: searchConsoleSpec,
    [ApiConnectorType.POSTHOG]: postHogSpec,
    [ApiConnectorType.META_ADS]: metaAdsSpec,
    [ApiConnectorType.GOOGLE_ADS]: googleAdsSpec,
    [ApiConnectorType.YOUTUBE_ANALYTICS]: youtubeAnalyticsSpec,
    [ApiConnectorType.LINKEDIN_ADS]: linkedInAdsSpec,
    [ApiConnectorType.GITHUB]: githubSpec,
    [ApiConnectorType.PYLON]: pylonSpec,
    [ApiConnectorType.ATTIO]: attioSpec,
    [ApiConnectorType.HUBSPOT]: hubspotSpec,
    [ApiConnectorType.SALESFORCE]: salesforceSpec,
};

const TEST_WITH_POINTS = {
    test_account: 3,
    our_account: 2,
    paid_account: 1,
    cant_test: 0,
} as const;

const BLOCKING_NEEDS = new Set<LiveAuthNeed>([
    'card',
    'real_person',
    'vendor_approval',
    'sales_contract',
]);

/** Whether a customer can paste a token they created, which no vendor reviews. */
const acceptsToken = (connector: ApiConnectorType) => {
    const integration = getLiveIntegration(connector);
    try {
        integration.checkAuth({
            type: 'bearer_token',
            origin: integration.origins[0],
        });
        return true;
    } catch {
        return false;
    }
};

/** Gmail alone 2; plus a phone or someone adding us 1; anything blocking 0. */
const getNeedsPoints = (needs: LiveAuthNeed[]) => {
    if (needs.some((need) => BLOCKING_NEEDS.has(need))) return 0;
    return needs.length === 1 && needs[0] === 'gmail' ? 2 : 1;
};

const getAuthRating = (score: number) => {
    if (score >= 6) return 'easy';
    if (score >= 3) return 'medium';
    return 'hard';
};

/**
 * How easy access is, out of 7: where test data comes from (3), what a
 * person must provide (2), token sign-in (1) and no vendor review (1).
 */
export const getLiveAuthScore = (connector: ApiConnectorType) => {
    const { testWith, needs, oauthReview } = LIVE_SPECS[connector].auth;
    const hasToken = acceptsToken(connector);
    const score =
        TEST_WITH_POINTS[testWith] +
        getNeedsPoints(needs) +
        (hasToken ? 1 : 0) +
        (hasToken || oauthReview === null ? 1 : 0);
    return { score, rating: getAuthRating(score) };
};
