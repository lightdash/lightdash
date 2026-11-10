import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { getGoogleSignInUrl, isGoogleConnector } from './googleConnection';

describe('getGoogleSignInUrl', () => {
    it('starts a new sign-in with the trimmed name', () => {
        expect(
            getGoogleSignInUrl(
                'project-1',
                ApiConnectorType.SEARCH_CONSOLE,
                ' Search ',
                null,
                'settings',
            ),
        ).toBe(
            '/api/v1/ee/projects/project-1/live-sources/google/oauth/start?connector=search_console&name=Search',
        );
    });

    it('keeps the source uuid when reconnecting', () => {
        const url = new URL(
            getGoogleSignInUrl(
                'project-1',
                ApiConnectorType.SEARCH_CONSOLE,
                'Search',
                'connection-1',
                'settings',
            ),
            'http://localhost',
        );
        expect(url.searchParams.get('connectionUuid')).toBe('connection-1');
    });

    it('asks to come back to onboarding when started there', () => {
        const url = new URL(
            getGoogleSignInUrl(
                'project-1',
                ApiConnectorType.GA4,
                'Google Analytics',
                null,
                'onboarding',
            ),
            'http://localhost',
        );
        expect(url.searchParams.get('returnTo')).toBe('onboarding');
    });
});

describe('isGoogleConnector', () => {
    it('separates Google sources from PostHog', () => {
        expect(isGoogleConnector(ApiConnectorType.SEARCH_CONSOLE)).toBe(true);
        expect(isGoogleConnector(ApiConnectorType.GA4)).toBe(true);
        expect(isGoogleConnector(ApiConnectorType.POSTHOG)).toBe(false);
    });
});
