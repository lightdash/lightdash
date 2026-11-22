import {
    type CreateExternalConnection,
    type ExternalConnection,
    type ExternalConnectionApiSource,
    type UpdateExternalConnection,
} from '@lightdash/common';
import { useForm } from '@mantine/form';

/**
 * A live data source connected with one account id and one API token. Every
 * integration of this kind is a form definition and shares the dialog.
 */
export type TokenLiveSourceForm = {
    label: string;
    defaultName: string;
    origin: string;
    /** Null when the token alone decides what the source reads. */
    account: {
        label: string;
        description: string;
        placeholder: string;
        invalidMessage: string;
        /** Accepts the forms the provider's own UI shows the id in. */
        normalize: (value: string) => string;
        isValid: (normalizedValue: string) => boolean;
    } | null;
    tokenLabel: string;
    /** Where the token comes from and what it needs, in a few words. */
    tokenHint: string;
    /** The provider's page for creating one, when it has a stable address. */
    tokenUrl?: string;
    toApiSource: (accountId: string) => ExternalConnectionApiSource;
    /** The account id of a saved source, or blank for another integration's. */
    getAccountId: (connection: ExternalConnection) => string;
    /** The server pins the access rules for live data sources; these match them. */
    getAccess: (
        accountId: string,
    ) => Pick<
        CreateExternalConnection,
        'allowedMethods' | 'allowedPathPrefixes' | 'allowedContentTypes'
    >;
    /** A small read that proves the token reaches the account. */
    getTestRequest: (accountId: string) => {
        method: 'GET' | 'POST';
        path: string;
        query: Record<string, string>;
    };
};

export type TokenLiveSourceValues = {
    name: string;
    accountId: string;
    token: string;
};

/** A saved token stays when the field is blank. */
export const useTokenLiveSourceForm = (
    form: TokenLiveSourceForm,
    connection: ExternalConnection | null,
) =>
    useForm<TokenLiveSourceValues>({
        initialValues: connection
            ? {
                  name: connection.name,
                  accountId: form.getAccountId(connection),
                  token: '',
              }
            : { name: form.defaultName, accountId: '', token: '' },
        validate: {
            name: (value) =>
                value.trim().length === 0 ? 'Give it a name' : null,
            accountId: (value) =>
                !form.account ||
                form.account.isValid(form.account.normalize(value))
                    ? null
                    : form.account.invalidMessage,
            token: (value) =>
                !connection && value.trim().length === 0
                    ? `Paste the ${form.tokenLabel.toLowerCase()}`
                    : null,
        },
    });

/** The account id as the API takes it; blank for forms without one. */
export const normalizeAccountId = (form: TokenLiveSourceForm, value: string) =>
    form.account ? form.account.normalize(value) : '';

export const toTokenLiveSourceCreatePayload = (
    form: TokenLiveSourceForm,
    values: TokenLiveSourceValues,
): CreateExternalConnection => {
    const accountId = normalizeAccountId(form, values.accountId);
    return {
        name: values.name.trim(),
        type: 'bearer_token',
        origin: form.origin,
        secret: values.token.trim(),
        apiSource: form.toApiSource(accountId),
        ...form.getAccess(accountId),
        allowBrowserImages: false,
        allowDataAppBuilderLinking: false,
        forwardUserIdentity: false,
        instructions: null,
    };
};

export const toTokenLiveSourceUpdatePayload = (
    form: TokenLiveSourceForm,
    values: TokenLiveSourceValues,
): UpdateExternalConnection => {
    const token = values.token.trim();
    return {
        name: values.name.trim(),
        apiSource: form.toApiSource(normalizeAccountId(form, values.accountId)),
        ...(token ? { secret: token } : {}),
    };
};
