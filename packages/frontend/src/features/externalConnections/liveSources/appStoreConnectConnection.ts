import {
    ApiConnectorType,
    APP_STORE_CONNECT_ORIGIN,
    getAppStoreConnectAppPath,
    LIVE_INTEGRATION_CATALOG,
    toAppStoreConnectSecret,
    type CreateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type AppStoreConnectConnectionValues = {
    name: string;
    appId: string;
    issuerId: string;
    keyId: string;
    /** The text of the key's .p8 file. */
    privateKey: string;
};

const APP_ID = /^\d{6,12}$/;
const ISSUER_ID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^[A-Z0-9]{10}$/;
const KEY_FILE_NAME = /^AuthKey_([A-Z0-9]{10})\.p8$/;

/** Apple names a team API key's file `AuthKey_<KEYID>.p8`. */
export const getAppStoreConnectKeyIdFromFileName = (
    fileName: string,
): string | null => KEY_FILE_NAME.exec(fileName)?.[1] ?? null;

export const useAppStoreConnectConnectionForm = () =>
    useForm<AppStoreConnectConnectionValues>({
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.APP_STORE_CONNECT]
                .defaultName,
            appId: '',
            issuerId: '',
            keyId: '',
            privateKey: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            appId: (value) =>
                APP_ID.test(value.trim())
                    ? null
                    : "Enter the app's Apple ID, the number in its App Store URL",
            issuerId: (value) =>
                ISSUER_ID.test(value.trim())
                    ? null
                    : 'Paste the issuer ID from Users and Access, Integrations',
            keyId: (value) =>
                KEY_ID.test(value.trim())
                    ? null
                    : 'Enter the 10-character key ID',
            privateKey: (value) =>
                value.includes('-----BEGIN PRIVATE KEY-----')
                    ? null
                    : "Choose the key's .p8 file",
        },
    });

/**
 * The key's three parts are stored as the one secret; the server pins the
 * access rules for live data sources, and these match them.
 */
export const toAppStoreConnectCreatePayload = (
    values: AppStoreConnectConnectionValues,
): CreateExternalConnection => {
    const appId = values.appId.trim();
    return {
        name: values.name.trim(),
        type: 'app_store_connect_key',
        origin: APP_STORE_CONNECT_ORIGIN,
        secret: toAppStoreConnectSecret({
            keyId: values.keyId,
            issuerId: values.issuerId,
            privateKey: values.privateKey,
        }),
        apiSource: { connector: ApiConnectorType.APP_STORE_CONNECT, appId },
        allowedMethods: ['GET'],
        allowedPathPrefixes: [getAppStoreConnectAppPath(appId)],
        allowedContentTypes: ['application/json'],
        allowBrowserImages: false,
        allowDataAppBuilderLinking: false,
        forwardUserIdentity: false,
        instructions: null,
    };
};

/** A small read that proves the key reaches the app: its latest version. */
export const getAppStoreConnectTestRequest = (appId: string) =>
    ({
        method: 'GET',
        path: `${getAppStoreConnectAppPath(appId.trim())}appStoreVersions`,
        query: {
            limit: '1',
            'fields[appStoreVersions]': 'versionString,appVersionState',
        },
    }) as const;
