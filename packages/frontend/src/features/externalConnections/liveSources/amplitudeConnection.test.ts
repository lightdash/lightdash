import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    toAmplitudeAuthorization,
    toAmplitudeCreatePayload,
} from './amplitudeConnection';

describe('amplitudeConnection', () => {
    it('signs in with HTTP Basic: the API key, then the secret key', () => {
        expect(toAmplitudeAuthorization(' key ', ' secret ')).toBe(
            `Basic ${btoa('key:secret')}`,
        );
    });

    it("creates a source on the region's host with the key pair in a header", () => {
        expect(
            toAmplitudeCreatePayload({
                name: ' Product ',
                region: 'eu',
                apiKey: 'key',
                secretKey: 'secret',
            }),
        ).toMatchObject({
            name: 'Product',
            type: 'api_key',
            origin: 'https://analytics.eu.amplitude.com',
            apiKeyName: 'Authorization',
            apiKeyLocation: 'header',
            secret: `Basic ${btoa('key:secret')}`,
            apiSource: { connector: ApiConnectorType.AMPLITUDE },
            allowedMethods: ['GET'],
            allowedPathPrefixes: expect.arrayContaining([
                '/api/2/events/segmentation',
                '/api/2/funnels',
                '/api/2/retention',
            ]),
        });
    });
});
