import { ApiConnectorType } from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getGooglePlayTestRequest,
    parseGooglePlayKeyFile,
    toGooglePlayCreatePayload,
} from './googlePlayConnection';

const KEY_FILE = JSON.stringify({
    type: 'service_account',
    client_email: 'vitals@project.iam.gserviceaccount.com',
    private_key:
        '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
});

describe('googlePlayConnection', () => {
    it("reads the service account's email from its JSON key", () => {
        expect(parseGooglePlayKeyFile(KEY_FILE)).toEqual({
            clientEmail: 'vitals@project.iam.gserviceaccount.com',
        });
    });

    it('rejects text that is not a service account key', () => {
        expect(parseGooglePlayKeyFile('not json')).toBeNull();
        expect(
            parseGooglePlayKeyFile(
                JSON.stringify({
                    type: 'authorized_user',
                    client_email: 'a@b.c',
                    private_key: 'k',
                }),
            ),
        ).toBeNull();
        expect(
            parseGooglePlayKeyFile(
                JSON.stringify({ type: 'service_account', client_email: 'a' }),
            ),
        ).toBeNull();
    });

    it("creates a source scoped to the app's reporting paths with the key as its secret", () => {
        expect(
            toGooglePlayCreatePayload({
                name: ' Android vitals ',
                packageName: ' com.example.app ',
                keyFile: ` ${KEY_FILE} `,
            }),
        ).toMatchObject({
            name: 'Android vitals',
            type: 'google_service_account',
            origin: 'https://playdeveloperreporting.googleapis.com',
            oauthScopes: [
                'https://www.googleapis.com/auth/playdeveloperreporting',
            ],
            secret: KEY_FILE,
            apiSource: {
                connector: ApiConnectorType.GOOGLE_PLAY,
                packageName: 'com.example.app',
            },
            allowedMethods: ['GET', 'POST'],
            allowedPathPrefixes: ['/v1beta1/apps/com.example.app/'],
        });
    });

    it("tests with a read of the app's crash rate metric set", () => {
        expect(getGooglePlayTestRequest('com.example.app')).toEqual({
            method: 'GET',
            path: '/v1beta1/apps/com.example.app/crashRateMetricSet',
            query: {},
        });
    });
});
