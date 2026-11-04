import {
    ApiConnectorType,
    POSTHOG_REGION_ORIGINS,
    type CreateExternalConnection,
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type PostHogRegion = keyof typeof POSTHOG_REGION_ORIGINS;

export type PostHogAuthMethod = 'signIn' | 'apiKey';

export type PostHogConnectionValues = {
    name: string;
    region: PostHogRegion;
    authMethod: PostHogAuthMethod;
    projectId: string;
    apiKey: string;
};

const PROJECT_ID = /^\d{1,12}$/;

export const getPostHogQueryPath = (projectId: string) =>
    `/api/projects/${projectId}/query/`;

const regionFromOrigin = (origin: string): PostHogRegion =>
    origin === POSTHOG_REGION_ORIGINS.eu ? 'eu' : 'us';

const isSignedInConnection = (connection: ExternalConnection) =>
    connection.type === 'oauth_authorization_code';

export const toPostHogFormValues = (
    connection: ExternalConnection | null,
    canSignIn: boolean,
): PostHogConnectionValues =>
    connection
        ? {
              name: connection.name,
              region: regionFromOrigin(connection.origin),
              authMethod: isSignedInConnection(connection)
                  ? 'signIn'
                  : 'apiKey',
              projectId:
                  connection.apiSource?.connector === ApiConnectorType.POSTHOG
                      ? connection.apiSource.projectId
                      : '',
              apiKey: '',
          }
        : {
              name: 'PostHog',
              region: 'us',
              authMethod: canSignIn ? 'signIn' : 'apiKey',
              projectId: '',
              apiKey: '',
          };

/** Signing in picks the project on PostHog; a saved key stays when the field is blank. */
export const usePostHogConnectionForm = (
    connection: ExternalConnection | null,
    canSignIn: boolean,
) =>
    useForm<PostHogConnectionValues>({
        initialValues: toPostHogFormValues(connection, canSignIn),
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            projectId: (value, values) =>
                values.authMethod === 'signIn' || PROJECT_ID.test(value.trim())
                    ? null
                    : 'Enter the numeric project ID from your PostHog URL',
            apiKey: (value, values) =>
                values.authMethod === 'apiKey' &&
                connection?.type !== 'bearer_token' &&
                value.trim().length === 0
                    ? 'API key is required'
                    : null,
        },
    });

/** Opens PostHog's consent screen; reconnecting keeps the source's uuid. */
export const getPostHogSignInUrl = (
    projectUuid: string,
    values: Pick<PostHogConnectionValues, 'name' | 'region'>,
    connectionUuid: string | null,
) => {
    const params = new URLSearchParams({
        region: values.region,
        name: values.name.trim(),
    });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/posthog/oauth/start?${params.toString()}`;
};

/** The server pins the access rules for API source connections; these match them. */
export const toPostHogCreatePayload = (
    values: PostHogConnectionValues,
): CreateExternalConnection => ({
    name: values.name.trim(),
    type: 'bearer_token',
    origin: POSTHOG_REGION_ORIGINS[values.region],
    secret: values.apiKey.trim(),
    apiSource: {
        connector: ApiConnectorType.POSTHOG,
        projectId: values.projectId.trim(),
    },
    allowedMethods: ['POST'],
    allowedPathPrefixes: [getPostHogQueryPath(values.projectId.trim())],
    allowedContentTypes: ['application/json'],
    allowBrowserImages: false,
    allowDataAppBuilderLinking: false,
    forwardUserIdentity: false,
    instructions: null,
});

export const toPostHogUpdatePayload = (
    values: PostHogConnectionValues,
): UpdateExternalConnection => {
    // Region and project of a signed-in source change only by reconnecting.
    if (values.authMethod === 'signIn') return { name: values.name.trim() };
    const apiKey = values.apiKey.trim();
    return {
        name: values.name.trim(),
        origin: POSTHOG_REGION_ORIGINS[values.region],
        apiSource: {
            connector: ApiConnectorType.POSTHOG,
            projectId: values.projectId.trim(),
        },
        ...(apiKey ? { secret: apiKey } : {}),
    };
};
