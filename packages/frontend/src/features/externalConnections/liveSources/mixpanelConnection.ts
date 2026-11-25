import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
    MIXPANEL_AUTH_HEADER,
    MIXPANEL_PATHS,
    MIXPANEL_REGION_ORIGINS,
    type CreateExternalConnection,
    type MixpanelRegion,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type MixpanelConnectionValues = {
    name: string;
    region: MixpanelRegion;
    projectId: string;
    username: string;
    secret: string;
};

/** Mixpanel signs Query API calls in with HTTP Basic: username, then secret. */
export const toMixpanelAuthorization = (username: string, secret: string) =>
    `Basic ${btoa(`${username.trim()}:${secret.trim()}`)}`;

export const useMixpanelConnectionForm = () =>
    useForm<MixpanelConnectionValues>({
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.MIXPANEL]
                .defaultName,
            region: 'us',
            projectId: '',
            username: '',
            secret: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            projectId: (value) =>
                /^\d+$/.test(value.trim())
                    ? null
                    : 'Paste the project ID, a number',
            username: (value) =>
                value.trim().length === 0
                    ? 'Paste the service account username'
                    : null,
            secret: (value) =>
                value.trim().length === 0
                    ? 'Paste the service account secret'
                    : null,
        },
    });

/**
 * The service account is stored as the Authorization header's value; the
 * server pins the access rules for live data sources, and these match them.
 */
export const toMixpanelCreatePayload = (
    values: MixpanelConnectionValues,
): CreateExternalConnection => ({
    name: values.name.trim(),
    type: 'api_key',
    origin: MIXPANEL_REGION_ORIGINS[values.region],
    apiKeyName: MIXPANEL_AUTH_HEADER,
    apiKeyLocation: 'header',
    secret: toMixpanelAuthorization(values.username, values.secret),
    apiSource: {
        connector: ApiConnectorType.MIXPANEL,
        projectId: values.projectId.trim(),
    },
    allowedMethods: ['GET'],
    allowedPathPrefixes: Object.values(MIXPANEL_PATHS),
    allowedContentTypes: ['application/json'],
    allowBrowserImages: false,
    allowDataAppBuilderLinking: false,
    forwardUserIdentity: false,
    instructions: null,
});

/** A small read that proves the service account reaches the project: its event names. */
export const getMixpanelTestRequest = (projectId: string) =>
    ({
        method: 'GET',
        path: MIXPANEL_PATHS.eventNames,
        query: { project_id: projectId.trim(), type: 'general', limit: '255' },
    }) as const;
