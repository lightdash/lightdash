import {
    AMPLITUDE_AUTH_HEADER,
    AMPLITUDE_PATHS,
    AMPLITUDE_REGION_ORIGINS,
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    type AmplitudeRegion,
    type CreateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type AmplitudeConnectionValues = {
    name: string;
    region: AmplitudeRegion;
    apiKey: string;
    secretKey: string;
};

/** Amplitude signs Dashboard API calls in with HTTP Basic: key, then secret. */
export const toAmplitudeAuthorization = (apiKey: string, secretKey: string) =>
    `Basic ${btoa(`${apiKey.trim()}:${secretKey.trim()}`)}`;

export const useAmplitudeConnectionForm = () =>
    useForm<AmplitudeConnectionValues>({
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.AMPLITUDE]
                .defaultName,
            region: 'us',
            apiKey: '',
            secretKey: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            apiKey: (value) =>
                value.trim().length === 0 ? 'Paste the API key' : null,
            secretKey: (value) =>
                value.trim().length === 0 ? 'Paste the secret key' : null,
        },
    });

/**
 * The key pair is stored as the Authorization header's value; the server
 * pins the access rules for live data sources, and these match them.
 */
export const toAmplitudeCreatePayload = (
    values: AmplitudeConnectionValues,
): CreateExternalConnection => ({
    name: values.name.trim(),
    type: 'api_key',
    origin: AMPLITUDE_REGION_ORIGINS[values.region],
    apiKeyName: AMPLITUDE_AUTH_HEADER,
    apiKeyLocation: 'header',
    secret: toAmplitudeAuthorization(values.apiKey, values.secretKey),
    apiSource: { connector: ApiConnectorType.AMPLITUDE },
    allowedMethods: ['GET'],
    allowedPathPrefixes: Object.values(AMPLITUDE_PATHS),
    allowedContentTypes: ['application/json'],
    allowBrowserImages: false,
    allowDataAppBuilderLinking: false,
    forwardUserIdentity: false,
    instructions: null,
});

/** A small read that proves the keys reach the project: its event list. */
export const AMPLITUDE_TEST_REQUEST = {
    method: 'GET',
    path: AMPLITUDE_PATHS.eventsList,
    query: {},
} as const;
