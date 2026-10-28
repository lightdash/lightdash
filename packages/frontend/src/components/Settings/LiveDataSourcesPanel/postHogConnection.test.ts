import { ApiConnectorType, type ExternalConnection } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
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
            toPostHogFormValues({
                name: 'Product analytics',
                origin: 'https://eu.posthog.com',
                apiSource: {
                    connector: ApiConnectorType.POSTHOG,
                    projectId: '4321',
                },
            } as ExternalConnection),
        ).toEqual({
            name: 'Product analytics',
            region: 'eu',
            projectId: '4321',
            apiKey: '',
        });
    });
});

describe('toPostHogUpdatePayload', () => {
    const values = {
        name: 'Product analytics',
        region: 'us' as const,
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

    it('sends a replacement key', () => {
        expect(
            toPostHogUpdatePayload({ ...values, apiKey: ' phx_new ' }),
        ).toEqual(expect.objectContaining({ secret: 'phx_new' }));
    });
});
