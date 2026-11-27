import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    describeLiveSources,
    getEnabledLiveSources,
    shortLiveSourceLabel,
} from './enabledLiveSources';

describe('getEnabledLiveSources', () => {
    it('keeps only turned-on integrations, in display order', () => {
        expect(
            getEnabledLiveSources([
                ApiConnectorType.HUBSPOT,
                ApiConnectorType.POSTHOG,
            ]).map(({ connector }) => connector),
        ).toEqual([ApiConnectorType.POSTHOG, ApiConnectorType.HUBSPOT]);
    });

    it('offers nothing until the list is known', () => {
        expect(getEnabledLiveSources(undefined)).toEqual([]);
    });
});

describe('describeLiveSources', () => {
    it('names one, two, or a few and more', () => {
        expect(describeLiveSources([])).toBe('');
        expect(describeLiveSources(['PostHog'])).toBe('PostHog');
        expect(describeLiveSources(['PostHog', 'HubSpot'])).toBe(
            'PostHog and HubSpot',
        );
        expect(describeLiveSources(['PostHog', 'HubSpot', 'GitHub'])).toBe(
            'PostHog, HubSpot and more',
        );
    });

    it('lists every one when they fit, joined as asked', () => {
        expect(
            describeLiveSources(['PostHog', 'GA4', 'Search Console'], {
                shown: 3,
                conjunction: 'or',
            }),
        ).toBe('PostHog, GA4 or Search Console');
    });
});

describe('shortLiveSourceLabel', () => {
    it('shortens the Google names', () => {
        expect(shortLiveSourceLabel('Google Analytics 4')).toBe('GA4');
        expect(shortLiveSourceLabel('Google Search Console')).toBe(
            'Search Console',
        );
        expect(shortLiveSourceLabel('PostHog')).toBe('PostHog');
    });
});
