import { ApiConnectorType, type ExternalConnection } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getPostHogSignInUrl,
    toPostHogCreatePayload,
    toPostHogFormValues,
    toPostHogUpdatePayload,
} from './postHogConnection';

describe('toPostHogCreatePayload', () => {
    it('builds a bearer connection scoped to the project query endpoint', () => {
        expect(
            toPostHogCreatePayload({
                name: ' Product analytics ',
                region: 'eu',
                authMethod: 'apiKey',
                projectId: ' 4321 ',
                apiKey: ' phx_test ',
            }),
        ).toEqual(
            expect.objectContaining({
                name: 'Product analytics',
                type: 'bearer_token',
                origin: 'https://eu.posthog.com',
                secret: 'phx_test',
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '4321',
                },
                allowedMethods: ['POST'],
                allowedPathPrefixes: ['/api/projects/4321/query/'],
                allowDataAppBuilderLinking: false,
            }),
        );
    });
});

describe('toPostHogFormValues', () => {
    it('reads region and project ID from a saved source, leaving the key blank', () => {
        expect(
            toPostHogFormValues(
                {
                    name: 'Product analytics',
                    origin: 'https://eu.posthog.com',
                    apiSource: {
                        connector: ApiConnectorType.POSTHOG,
                        projectId: '4321',
                    },
                } as ExternalConnection,
                true,
            ),
        ).toEqual({
            name: 'Product analytics',
            region: 'eu',
            authMethod: 'apiKey',
            projectId: '4321',
            apiKey: '',
        });
    });

    it('marks a signed-in source and defaults new sources to signing in when the server allows it', () => {
        expect(
            toPostHogFormValues(
                {
                    name: 'PostHog',
                    type: 'oauth_authorization_code',
                    origin: 'https://us.posthog.com',
                    apiSource: {
                        connector: ApiConnectorType.POSTHOG,
                        projectId: '7',
                    },
                } as ExternalConnection,
                true,
            ).authMethod,
        ).toBe('signIn');
        expect(toPostHogFormValues(null, true).authMethod).toBe('signIn');
        expect(toPostHogFormValues(null, false).authMethod).toBe('apiKey');
    });
});

describe('getPostHogSignInUrl', () => {
    it('starts sign-in for the region, carrying the source being reconnected', () => {
        const url = new URL(
            getPostHogSignInUrl(
                'project-1',
                { name: ' Product ', region: 'eu' },
                'connection-1',
            ),
            'https://lightdash.example.com',
        );
        expect(url.pathname).toBe(
            '/api/v1/ee/projects/project-1/live-sources/posthog/oauth/start',
        );
        expect(Object.fromEntries(url.searchParams)).toEqual({
            region: 'eu',
            name: 'Product',
            connectionUuid: 'connection-1',
        });
    });
});

describe('toPostHogUpdatePayload', () => {
    const values = {
        name: 'Product analytics',
        region: 'us' as const,
        authMethod: 'apiKey' as const,
        projectId: '4321',
        apiKey: '',
    };

    it('keeps the stored key when the field is blank', () => {
        expect(toPostHogUpdatePayload(values)).toEqual({
            name: 'Product analytics',
            origin: 'https://us.posthog.com',
            apiSource: {
                connector: ApiConnectorType.POSTHOG,
                projectId: '4321',
            },
        });
    });

    it('only renames a signed-in source', () => {
        expect(
            toPostHogUpdatePayload({ ...values, authMethod: 'signIn' }),
        ).toEqual({ name: 'Product analytics' });
    });

    it('sends a replacement key', () => {
        expect(
            toPostHogUpdatePayload({ ...values, apiKey: ' phx_new ' }),
        ).toEqual(expect.objectContaining({ secret: 'phx_new' }));
    });
});
