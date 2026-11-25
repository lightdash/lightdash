import {
    ApiConnectorType,
    getGooglePlayAppPath,
    getGooglePlayMetricSetPath,
    GOOGLE_PLAY_ORIGIN,
    GOOGLE_PLAY_SCOPE,
    LIVE_INTEGRATION_CATALOG,
    type CreateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type GooglePlayConnectionValues = {
    name: string;
    packageName: string;
    /** The text of the service account's JSON key file. */
    keyFile: string;
};

const PACKAGE_NAME_PATTERN =
    /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

/** The account a JSON key signs in as; the private key never leaves the file's text. */
export const parseGooglePlayKeyFile = (
    text: string,
): { clientEmail: string } | null => {
    try {
        const key: unknown = JSON.parse(text);
        if (
            typeof key === 'object' &&
            key !== null &&
            'type' in key &&
            key.type === 'service_account' &&
            'client_email' in key &&
            typeof key.client_email === 'string' &&
            'private_key' in key &&
            typeof key.private_key === 'string'
        ) {
            return { clientEmail: key.client_email };
        }
        return null;
    } catch {
        return null;
    }
};

export const useGooglePlayConnectionForm = () =>
    useForm<GooglePlayConnectionValues>({
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.GOOGLE_PLAY]
                .defaultName,
            packageName: '',
            keyFile: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            packageName: (value) =>
                PACKAGE_NAME_PATTERN.test(value.trim())
                    ? null
                    : 'Enter the package name, such as com.example.app',
            keyFile: (value) =>
                parseGooglePlayKeyFile(value)
                    ? null
                    : "Choose the service account's JSON key file",
        },
    });

/**
 * The JSON key is the secret; the server mints a token from it for the
 * Play Developer Reporting scope and keeps every call under the app.
 */
export const toGooglePlayCreatePayload = (
    values: GooglePlayConnectionValues,
): CreateExternalConnection => {
    const packageName = values.packageName.trim();
    return {
        name: values.name.trim(),
        type: 'google_service_account',
        origin: GOOGLE_PLAY_ORIGIN,
        oauthScopes: [GOOGLE_PLAY_SCOPE],
        secret: values.keyFile.trim(),
        apiSource: { connector: ApiConnectorType.GOOGLE_PLAY, packageName },
        allowedMethods: ['GET', 'POST'],
        allowedPathPrefixes: [getGooglePlayAppPath(packageName)],
        allowedContentTypes: ['application/json'],
        allowBrowserImages: false,
        allowDataAppBuilderLinking: false,
        forwardUserIdentity: false,
        instructions: null,
    };
};

/** A small read that proves the account can see the app: its crash rate's freshness. */
export const getGooglePlayTestRequest = (packageName: string) =>
    ({
        method: 'GET',
        path: getGooglePlayMetricSetPath(
            packageName.trim(),
            'crashRateMetricSet',
        ),
        query: {},
    }) as const;
