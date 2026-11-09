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
    description: string;
    origin: string;
    account: {
        label: string;
        description: string;
        placeholder: string;
        invalidMessage: string;
        /** Accepts the forms the provider's own UI shows the id in. */
        normalize: (value: string) => string;
        isValid: (normalizedValue: string) => boolean;
    };
    tokenLabel: string;
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
                value.trim().length === 0 ? 'Name is required' : null,
            accountId: (value) =>
                form.account.isValid(form.account.normalize(value))
                    ? null
                    : form.account.invalidMessage,
            token: (value) =>
                !connection && value.trim().length === 0
                    ? `${form.tokenLabel} is required`
                    : null,
        },
    });

export const toTokenLiveSourceCreatePayload = (
    form: TokenLiveSourceForm,
    values: TokenLiveSourceValues,
): CreateExternalConnection => {
    const accountId = form.account.normalize(values.accountId);
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
        apiSource: form.toApiSource(form.account.normalize(values.accountId)),
        ...(token ? { secret: token } : {}),
    };
};
