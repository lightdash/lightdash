import {
    ApiConnectorType,
    POSTHOG_REGION_ORIGINS,
    type CreateExternalConnection,
    type ExternalConnection,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type PostHogRegion = keyof typeof POSTHOG_REGION_ORIGINS;

export type PostHogConnectionValues = {
    name: string;
    region: PostHogRegion;
    projectId: string;
    apiKey: string;
};

const PROJECT_ID = /^\d{1,12}$/;

export const getPostHogQueryPath = (projectId: string) =>
    `/api/projects/${projectId}/query/`;

const regionFromOrigin = (origin: string): PostHogRegion =>
    origin === POSTHOG_REGION_ORIGINS.eu ? 'eu' : 'us';

export const toPostHogFormValues = (
    connection: ExternalConnection | null,
): PostHogConnectionValues =>
    connection
        ? {
              name: connection.name,
              region: regionFromOrigin(connection.origin),
              projectId: connection.apiSource?.projectId ?? '',
              apiKey: '',
          }
        : { name: 'PostHog', region: 'us', projectId: '', apiKey: '' };

/** A saved connection keeps its key when the field is left blank. */
export const usePostHogConnectionForm = (
    connection: ExternalConnection | null,
) =>
    useForm<PostHogConnectionValues>({
        initialValues: toPostHogFormValues(connection),
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Name is required' : null,
            projectId: (value) =>
                PROJECT_ID.test(value.trim())
                    ? null
                    : 'Enter the numeric project ID from your PostHog URL',
            apiKey: (value) =>
                !connection && value.trim().length === 0
                    ? 'API key is required'
                    : null,
        },
    });

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
