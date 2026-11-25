import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getMixpanelTestRequest,
    toMixpanelAuthorization,
    toMixpanelCreatePayload,
} from './mixpanelConnection';

describe('mixpanelConnection', () => {
    it('signs in with HTTP Basic: the username, then the secret', () => {
        expect(toMixpanelAuthorization(' sa.user ', ' secret ')).toBe(
            `Basic ${btoa('sa.user:secret')}`,
        );
    });

    it("creates a source on the region's host with the service account in a header", () => {
        expect(
            toMixpanelCreatePayload({
                name: ' Product ',
                region: 'in',
                projectId: ' 12345 ',
                username: 'sa.user',
                secret: 'secret',
            }),
        ).toMatchObject({
            name: 'Product',
            type: 'api_key',
            origin: 'https://in.mixpanel.com',
            apiKeyName: 'Authorization',
            apiKeyLocation: 'header',
            secret: `Basic ${btoa('sa.user:secret')}`,
            apiSource: {
                connector: ApiConnectorType.MIXPANEL,
                projectId: '12345',
            },
            allowedMethods: ['GET'],
            allowedPathPrefixes: expect.arrayContaining([
                '/api/query/segmentation',
                '/api/query/funnels',
                '/api/query/retention',
                '/api/query/events/names',
            ]),
        });
    });

    it('tests against the project the form names', () => {
        expect(getMixpanelTestRequest(' 12345 ')).toEqual({
            method: 'GET',
            path: '/api/query/events/names',
            query: { project_id: '12345', type: 'general', limit: '255' },
        });
    });
});
