import {
    ApiConnectorType,
    LIVE_INTEGRATION_CATALOG,
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
    aiHint: string;
};

const PROJECT_ID = /^\d{1,12}$/;

/** The PostHog project a source reads with a personal API key. */
export const POSTHOG_PROJECT_ID_FIELD = {
    label: 'Project ID',
    description: 'From Project settings',
    placeholder: '12345',
    invalidMessage: 'Use the numbers only, as shown in Project settings',
    isValid: (value: string) => PROJECT_ID.test(value.trim()),
};

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
              aiHint: connection.aiHint ?? '',
          }
        : {
              name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.POSTHOG]
                  .defaultName,
              region: 'us',
              authMethod: canSignIn ? 'signIn' : 'apiKey',
              projectId: '',
              apiKey: '',
              aiHint: '',
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
                value.trim().length === 0 ? 'Give it a name' : null,
            projectId: (value, values) =>
                values.authMethod === 'signIn' ||
                POSTHOG_PROJECT_ID_FIELD.isValid(value)
                    ? null
                    : POSTHOG_PROJECT_ID_FIELD.invalidMessage,
            apiKey: (value, values) =>
                values.authMethod === 'apiKey' &&
                connection?.type !== 'bearer_token' &&
                value.trim().length === 0
                    ? 'Paste a personal API key'
                    : null,
        },
    });

/** The page a sign-in comes back to once the provider redirects. */
export type LiveSourceReturnTo = 'settings' | 'onboarding';

export const setLiveSourceReturnTo = (
    params: URLSearchParams,
    returnTo: LiveSourceReturnTo,
) => {
    if (returnTo === 'onboarding') params.set('returnTo', returnTo);
};

/** Opens PostHog's consent screen; reconnecting keeps the source's uuid. */
export const getPostHogSignInUrl = (
    projectUuid: string,
    values: Pick<PostHogConnectionValues, 'name' | 'region'>,
    connectionUuid: string | null,
    returnTo: LiveSourceReturnTo,
    explorePrefix?: string,
) => {
    const params = new URLSearchParams({
        region: values.region,
        name: values.name.trim(),
    });
    if (connectionUuid) params.set('connectionUuid', connectionUuid);
    if (explorePrefix) params.set('explorePrefix', explorePrefix);
    setLiveSourceReturnTo(params, returnTo);
    return `/api/v1/ee/projects/${projectUuid}/live-sources/posthog/oauth/start?${params.toString()}`;
};

/** The server pins the access rules for API source connections; these match them. */
export const toPostHogCreatePayload = (
    values: PostHogConnectionValues,
    explorePrefix?: string,
): CreateExternalConnection => ({
    name: values.name.trim(),
    ...(explorePrefix ? { explorePrefix } : {}),
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
    if (values.authMethod === 'signIn') {
        return { name: values.name.trim(), aiHint: values.aiHint };
    }
    const apiKey = values.apiKey.trim();
    return {
        name: values.name.trim(),
        origin: POSTHOG_REGION_ORIGINS[values.region],
        apiSource: {
            connector: ApiConnectorType.POSTHOG,
            projectId: values.projectId.trim(),
        },
        aiHint: values.aiHint,
        ...(apiKey ? { secret: apiKey } : {}),
    };
};
