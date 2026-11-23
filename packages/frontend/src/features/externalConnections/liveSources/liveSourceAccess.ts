/**
 * How a live data source reaches its integration, as its settings edit it:
 * a token with an optional account id, a PostHog API key with its project,
 * or a sign-in that only signing in again changes.
 */
import {
    ApiConnectorType,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { getLiveSource } from './liveSourceCatalog';
import { type LiveSourceConnection } from './liveSourceRows';
import {
    POSTHOG_PROJECT_ID_FIELD,
    toPostHogFormValues,
    toPostHogUpdatePayload,
    type PostHogRegion,
} from './postHogConnection';
import {
    toTokenLiveSourceUpdatePayload,
    type TokenLiveSourceForm,
} from './tokenLiveSource';

export type LiveSourceAccess =
    | { kind: 'token'; form: TokenLiveSourceForm }
    | { kind: 'posthogKey' }
    | { kind: 'signedIn' };

export type LiveSourceAccessValues = {
    name: string;
    aiHint: string;
    accountId: string;
    /** Blank keeps the saved token. */
    token: string;
    /** Where a PostHog key reaches; other sources ignore it. */
    region: PostHogRegion;
};

type AccountField = {
    label: string;
    description: string;
    placeholder: string;
    validate: (value: string) => string | null;
};

export const getLiveSourceAccess = (
    connection: LiveSourceConnection,
): LiveSourceAccess => {
    const { setup } = getLiveSource(connection.apiSource.connector);
    if (setup.kind === 'token') return { kind: 'token', form: setup.form };
    if (setup.kind === 'posthog' && connection.type === 'bearer_token')
        return { kind: 'posthogKey' };
    return { kind: 'signedIn' };
};

/** The account id field, when the source has one that can be edited. */
export const getAccountField = (
    access: LiveSourceAccess,
): AccountField | null => {
    switch (access.kind) {
        case 'token': {
            const { account } = access.form;
            if (!account) return null;
            return {
                label: account.label,
                description: account.description,
                placeholder: account.placeholder,
                validate: (value) =>
                    account.isValid(account.normalize(value))
                        ? null
                        : account.invalidMessage,
            };
        }
        case 'posthogKey':
            return {
                ...POSTHOG_PROJECT_ID_FIELD,
                validate: (value) =>
                    POSTHOG_PROJECT_ID_FIELD.isValid(value)
                        ? null
                        : POSTHOG_PROJECT_ID_FIELD.invalidMessage,
            };
        case 'signedIn':
            return null;
        default:
            return null;
    }
};

/** The label of the saved secret, or null for a sign-in. */
export const getTokenLabel = (access: LiveSourceAccess) => {
    switch (access.kind) {
        case 'token':
            return access.form.tokenLabel;
        case 'posthogKey':
            return 'Personal API key';
        default:
            return null;
    }
};

export const toLiveSourceAccessValues = (
    connection: LiveSourceConnection,
    access: LiveSourceAccess,
): LiveSourceAccessValues => {
    const { apiSource } = connection;
    let accountId = '';
    if (access.kind === 'token')
        accountId = access.form.getAccountId(connection);
    if (
        access.kind === 'posthogKey' &&
        apiSource.connector === ApiConnectorType.POSTHOG
    )
        accountId = apiSource.projectId;
    return {
        name: connection.name,
        aiHint: connection.aiHint ?? '',
        accountId,
        token: '',
        region:
            access.kind === 'posthogKey'
                ? toPostHogFormValues(connection, false).region
                : 'us',
    };
};

export const toLiveSourceAccessUpdate = (
    connection: LiveSourceConnection,
    access: LiveSourceAccess,
    values: LiveSourceAccessValues,
): UpdateExternalConnection => {
    const aiHint = values.aiHint.trim();
    switch (access.kind) {
        case 'token':
            return {
                ...toTokenLiveSourceUpdatePayload(access.form, values),
                aiHint,
            };
        case 'posthogKey':
            return toPostHogUpdatePayload({
                ...toPostHogFormValues(connection, false),
                name: values.name,
                region: values.region,
                projectId: values.accountId,
                apiKey: values.token,
                aiHint,
            });
        case 'signedIn':
        default:
            return { name: values.name.trim(), aiHint };
    }
};
