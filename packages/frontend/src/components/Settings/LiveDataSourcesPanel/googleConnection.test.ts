import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getApiSourceTarget,
    getGoogleSignInUrl,
    isGoogleConnector,
} from './googleConnection';

describe('getGoogleSignInUrl', () => {
    it('starts a new sign-in with the trimmed name', () => {
        expect(
            getGoogleSignInUrl(
                'project-1',
                ApiConnectorType.SEARCH_CONSOLE,
                ' Search ',
                null,
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
            ),
            'http://localhost',
        );
        expect(url.searchParams.get('connectionUuid')).toBe('connection-1');
    });
});

describe('getApiSourceTarget', () => {
    it('names what each source reads', () => {
        expect(
            getApiSourceTarget({
                connector: ApiConnectorType.POSTHOG,
                projectId: '4321',
            }),
        ).toBe('Project 4321');
        expect(
            getApiSourceTarget({
                connector: ApiConnectorType.SEARCH_CONSOLE,
                siteUrl: 'sc-domain:example.com',
            }),
        ).toBe('sc-domain:example.com');
        expect(
            getApiSourceTarget({
                connector: ApiConnectorType.GA4,
                propertyId: '123456',
            }),
        ).toBe('Property 123456');
    });
});

describe('isGoogleConnector', () => {
    it('separates Google sources from PostHog', () => {
        expect(isGoogleConnector(ApiConnectorType.SEARCH_CONSOLE)).toBe(true);
        expect(isGoogleConnector(ApiConnectorType.GA4)).toBe(true);
        expect(isGoogleConnector(ApiConnectorType.POSTHOG)).toBe(false);
    });
});
