import {
    ApiConnectorType,
    parseAppStoreConnectSecret,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    getAppStoreConnectKeyIdFromFileName,
    getAppStoreConnectTestRequest,
    toAppStoreConnectCreatePayload,
} from './appStoreConnectConnection';

const PRIVATE_KEY =
    '-----BEGIN PRIVATE KEY-----\nMIGfake\n-----END PRIVATE KEY-----';
const ISSUER_ID = '6f1c2b8e-3d4a-4e5f-9a0b-1c2d3e4f5a6b';

describe('appStoreConnectConnection', () => {
    it("reads the key ID from Apple's file name", () => {
        expect(
            getAppStoreConnectKeyIdFromFileName('AuthKey_ABCDE12345.p8'),
        ).toBe('ABCDE12345');
        expect(getAppStoreConnectKeyIdFromFileName('key.p8')).toBeNull();
        expect(
            getAppStoreConnectKeyIdFromFileName('AuthKey_ABCDE12345 (1).p8'),
        ).toBeNull();
    });

    it("creates a source scoped to the app with the key's parts as its secret", () => {
        const payload = toAppStoreConnectCreatePayload({
            name: ' Mobile app ',
            appId: ' 1234567890 ',
            issuerId: ` ${ISSUER_ID} `,
            keyId: ' ABCDE12345 ',
            privateKey: `${PRIVATE_KEY}\n`,
        });
        expect(payload).toMatchObject({
            name: 'Mobile app',
            type: 'app_store_connect_key',
            origin: 'https://api.appstoreconnect.apple.com',
            apiSource: {
                connector: ApiConnectorType.APP_STORE_CONNECT,
                appId: '1234567890',
            },
            allowedMethods: ['GET'],
            allowedPathPrefixes: ['/v1/apps/1234567890/'],
            allowedContentTypes: ['application/json'],
        });
        expect(parseAppStoreConnectSecret(payload.secret ?? '')).toEqual({
            keyId: 'ABCDE12345',
            issuerId: ISSUER_ID,
            privateKey: PRIVATE_KEY,
        });
    });

    it("tests with the app's latest version", () => {
        expect(getAppStoreConnectTestRequest(' 1234567890 ')).toEqual({
            method: 'GET',
            path: '/v1/apps/1234567890/appStoreVersions',
            query: {
                limit: '1',
                'fields[appStoreVersions]': 'versionString,appVersionState',
            },
        });
    });
});
