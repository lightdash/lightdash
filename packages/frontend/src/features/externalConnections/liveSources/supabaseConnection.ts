import {
    ApiConnectorType,
    getSupabaseTablePath,
    isSupabaseOrigin,
    isSupabaseTableName,
    LIVE_INTEGRATION_CATALOG,
    SUPABASE_AUTH_HEADER,
    SUPABASE_REST_PATH,
    type CreateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

export type SupabaseConnectionValues = {
    name: string;
    projectUrl: string;
    table: string;
    secret: string;
};

// A project ref, as the dashboard URL shows it
const PROJECT_REF = /^[a-z0-9]{20}$/;

/**
 * The project's origin from what people paste: the project URL, the URL
 * with /rest/v1 on it, or the bare project ref.
 */
export const toSupabaseOrigin = (value: string) => {
    const trimmed = value.trim();
    if (PROJECT_REF.test(trimmed)) return `https://${trimmed}.supabase.co`;
    try {
        return new URL(trimmed).origin;
    } catch {
        return trimmed;
    }
};

export const useSupabaseConnectionForm = () =>
    useForm<SupabaseConnectionValues>({
        initialValues: {
            name: LIVE_INTEGRATION_CATALOG[ApiConnectorType.SUPABASE]
                .defaultName,
            projectUrl: '',
            table: '',
            secret: '',
        },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            projectUrl: (value) =>
                isSupabaseOrigin(toSupabaseOrigin(value))
                    ? null
                    : 'Paste the project URL, like https://abcd.supabase.co',
            table: (value) =>
                isSupabaseTableName(value.trim())
                    ? null
                    : 'Use the name of one table or view',
            secret: (value) =>
                value.trim().length === 0 ? 'Paste a secret key' : null,
        },
    });

/**
 * The key is sent on Supabase's apikey header; the server pins the access
 * rules for live data sources, and these match them.
 */
export const toSupabaseCreatePayload = (
    values: SupabaseConnectionValues,
): CreateExternalConnection => ({
    name: values.name.trim(),
    type: 'api_key',
    origin: toSupabaseOrigin(values.projectUrl),
    apiKeyName: SUPABASE_AUTH_HEADER,
    apiKeyLocation: 'header',
    secret: values.secret.trim(),
    apiSource: {
        connector: ApiConnectorType.SUPABASE,
        table: values.table.trim(),
    },
    allowedMethods: ['GET'],
    allowedPathPrefixes: [SUPABASE_REST_PATH],
    allowedContentTypes: ['application/json'],
    allowBrowserImages: false,
    allowDataAppBuilderLinking: false,
    forwardUserIdentity: false,
    instructions: null,
});

/** A one-row read that proves the key reaches the table. */
export const getSupabaseTestRequest = (table: string) =>
    ({
        method: 'GET',
        path: getSupabaseTablePath(table.trim()),
        query: { select: '*', limit: '1' },
    }) as const;
