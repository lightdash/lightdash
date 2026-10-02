import { describe, expect, it } from 'vitest';
import {
    getBigqueryConsentRedirect,
    getBigqueryLoginOptions,
} from './bigqueryLoginOptions';

describe('BigQuery login options', () => {
    it('uses the account hint without consent for a light reconnect', () => {
        expect(
            getBigqueryLoginOptions({
                lightReconnect: true,
                forceConsent: false,
                loginHint: 'person@example.com',
            }),
        ).toMatchObject({ loginHint: 'person@example.com' });
        expect(
            getBigqueryLoginOptions({
                lightReconnect: true,
                forceConsent: false,
                loginHint: 'person@example.com',
            }),
        ).not.toHaveProperty('prompt');
    });

    it.each([
        { lightReconnect: false, forceConsent: false },
        { lightReconnect: true, forceConsent: true },
    ])('requires consent when the flag is off or forced', (options) => {
        expect(
            getBigqueryLoginOptions({ ...options, loginHint: undefined }),
        ).toMatchObject({ prompt: 'consent' });
    });

    it('preserves popup and return state for the one forced retry', () => {
        expect(
            getBigqueryConsentRedirect({
                isPopup: true,
                returnTo: 'https://example.com/dashboard',
            }),
        ).toBe(
            '/api/v1/login/bigquery?forceConsent=true&isPopup=true&redirect=https%3A%2F%2Fexample.com%2Fdashboard',
        );
    });
});
