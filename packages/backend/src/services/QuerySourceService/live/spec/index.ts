import { ApiConnectorType } from '@lightdash/common';
import { attioSpec } from '../integrations/attio/spec';
import { attioUseCases } from '../integrations/attio/useCases';
import { ga4Spec } from '../integrations/ga4/spec';
import { ga4UseCases } from '../integrations/ga4/useCases';
import { githubSpec } from '../integrations/github/spec';
import { githubUseCases } from '../integrations/github/useCases';
import { googleAdsSpec } from '../integrations/googleAds/spec';
import { googleAdsUseCases } from '../integrations/googleAds/useCases';
import { hubspotSpec } from '../integrations/hubspot/spec';
import { hubspotUseCases } from '../integrations/hubspot/useCases';
import { linkedInAdsSpec } from '../integrations/linkedInAds/spec';
import { linkedInAdsUseCases } from '../integrations/linkedInAds/useCases';
import { metaAdsSpec } from '../integrations/metaAds/spec';
import { metaAdsUseCases } from '../integrations/metaAds/useCases';
import { postHogSpec } from '../integrations/postHog/spec';
import { postHogUseCases } from '../integrations/postHog/useCases';
import { pylonSpec } from '../integrations/pylon/spec';
import { pylonUseCases } from '../integrations/pylon/useCases';
import { salesforceSpec } from '../integrations/salesforce/spec';
import { salesforceUseCases } from '../integrations/salesforce/useCases';
import { searchConsoleSpec } from '../integrations/searchConsole/spec';
import { searchConsoleUseCases } from '../integrations/searchConsole/useCases';
import { youtubeAnalyticsSpec } from '../integrations/youtubeAnalytics/spec';
import { youtubeAnalyticsUseCases } from '../integrations/youtubeAnalytics/useCases';
import {
    type LiveAuthNeed,
    type LiveIntegrationSpec,
    type LiveUseCases,
} from './types';

export { crossToolUseCases } from './crossToolUseCases';

/** One per integration; a missing one fails typecheck. */
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

/** One per integration; a missing one fails typecheck. */
export const LIVE_USE_CASES: { [C in ApiConnectorType]: LiveUseCases } = {
    [ApiConnectorType.GA4]: ga4UseCases,
    [ApiConnectorType.SEARCH_CONSOLE]: searchConsoleUseCases,
    [ApiConnectorType.POSTHOG]: postHogUseCases,
    [ApiConnectorType.META_ADS]: metaAdsUseCases,
    [ApiConnectorType.GOOGLE_ADS]: googleAdsUseCases,
    [ApiConnectorType.YOUTUBE_ANALYTICS]: youtubeAnalyticsUseCases,
    [ApiConnectorType.LINKEDIN_ADS]: linkedInAdsUseCases,
    [ApiConnectorType.GITHUB]: githubUseCases,
    [ApiConnectorType.PYLON]: pylonUseCases,
    [ApiConnectorType.ATTIO]: attioUseCases,
    [ApiConnectorType.HUBSPOT]: hubspotUseCases,
    [ApiConnectorType.SALESFORCE]: salesforceUseCases,
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
 * person must provide (2), a token a customer can paste (1), and a way in
 * with no vendor review (1).
 */
export const getLiveAuthScore = ({ auth }: LiveIntegrationSpec) => {
    const score =
        TEST_WITH_POINTS[auth.testWith] +
        getNeedsPoints(auth.needs) +
        (auth.token ? 1 : 0) +
        (auth.token || auth.oauth === 'no_review' ? 1 : 0);
    return { score, rating: getAuthRating(score) };
};
