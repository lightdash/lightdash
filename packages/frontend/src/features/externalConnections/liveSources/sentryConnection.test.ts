import {
    ApiConnectorType,
    type ExternalConnection,
    type SentryApiSource,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import { SENTRY_TOKEN_FORM } from './sentryConnection';
import {
    toTokenLiveSourceCreatePayload,
    toTokenLiveSourceUpdatePayload,
} from './tokenLiveSource';

describe('sentryConnection', () => {
    it('accepts an organization with the projects to read', () => {
        const { normalize, isValid } = SENTRY_TOKEN_FORM.account;
        expect(normalize(' Acme/Mobile-iOS, mobile-android ')).toBe(
            'acme/mobile-ios,mobile-android',
        );
        expect(isValid('acme/mobile-ios')).toBe(true);
        expect(isValid('acme/mobile-ios,mobile_android')).toBe(true);
        // Every project the token reads is too much: name them
        expect(isValid('acme')).toBe(false);
        expect(isValid('acme/')).toBe(false);
        expect(isValid('acme/mobile-ios,,')).toBe(false);
        expect(isValid('acme/mobile-ios/extra')).toBe(false);
        expect(isValid('acme/../other')).toBe(false);
        // Sentry reads a slug of digits only as an ID
        expect(isValid('acme/12345')).toBe(false);
    });

    it('creates a token-authenticated source that reads the named projects', () => {
        expect(
            toTokenLiveSourceCreatePayload(SENTRY_TOKEN_FORM, {
                name: ' Sentry ',
                accountId: 'acme/mobile-ios, mobile-android',
                token: ' token ',
            }),
        ).toMatchObject({
            name: 'Sentry',
            type: 'bearer_token',
            origin: 'https://sentry.io',
            secret: 'token',
            apiSource: {
                connector: ApiConnectorType.SENTRY,
                organizationSlug: 'acme',
                projectSlugs: ['mobile-ios', 'mobile-android'],
            },
            allowedMethods: ['GET'],
            // No path lists the projects of the organization
            allowedPathPrefixes: [
                '/api/0/organizations/acme/events/',
                '/api/0/organizations/acme/issues/',
                '/api/0/organizations/acme/sessions/',
            ],
        });
    });

    it('asks for a test with no query of its own: the server writes the request', () => {
        expect(SENTRY_TOKEN_FORM.getTestRequest('acme/mobile-ios')).toEqual({
            method: 'GET',
            path: '/api/0/organizations/acme/events/',
            query: {},
        });
    });

    it('shows a saved source as it was typed, and keeps its token when the field is blank', () => {
        const apiSource: SentryApiSource = {
            connector: ApiConnectorType.SENTRY,
            organizationSlug: 'acme',
            projectSlugs: ['mobile-ios', 'mobile-android'],
        };
        expect(
            SENTRY_TOKEN_FORM.getAccountId({ apiSource } as ExternalConnection),
        ).toBe('acme/mobile-ios,mobile-android');
        expect(
            toTokenLiveSourceUpdatePayload(SENTRY_TOKEN_FORM, {
                name: 'Sentry',
                accountId: 'acme/mobile-ios,mobile-android',
                token: ' ',
            }),
        ).toEqual({ name: 'Sentry', apiSource });
    });
});
