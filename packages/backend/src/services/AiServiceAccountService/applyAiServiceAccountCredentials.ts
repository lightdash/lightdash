import {
    BigqueryAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type AiServiceAccountCredentialInput,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import omit from 'lodash/omit';
import {
    parseAiServiceAccountSecrets,
    type AiServiceAccountSecrets,
} from '../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';

export const mergeAiServiceAccountCredentials = (
    input: AiServiceAccountCredentialInput,
    saved: AiServiceAccountSecrets | null,
): AiServiceAccountSecrets => {
    const previous =
        saved?.type === input.type &&
        saved.authenticationType === input.authenticationType
            ? saved
            : null;
    return parseAiServiceAccountSecrets({
        ...previous,
        ...Object.fromEntries(
            Object.entries(input).filter(([, value]) => value !== undefined),
        ),
    });
};

export const applyAiServiceAccountCredentials = (
    connection: CreateWarehouseCredentials,
    secrets: AiServiceAccountSecrets,
): CreateWarehouseCredentials => {
    const credentials = parseAiServiceAccountSecrets(secrets);
    const inheritedAuthFields = [
        'authenticationType',
        'user',
        'password',
        'privateKey',
        'privateKeyPass',
        'keyfileContents',
        'token',
        'refreshToken',
        'personalAccessToken',
        'oauthClientId',
        'oauthClientSecret',
        'organizationWarehouseCredentialsUuid',
        'accessKeyId',
        'secretAccessKey',
        'sessionToken',
        'requireAgentSession',
        'requireUserCredentials',
        'allowUserCredentials',
    ] as const;
    if (connection.type !== WarehouseTypes.BIGQUERY) {
        throw new ParameterError(
            'This warehouse does not support an AI service account.',
        );
    }
    const base = omit(connection, inheritedAuthFields) as Omit<
        typeof connection,
        (typeof inheritedAuthFields)[number]
    >;
    return {
        ...base,
        ...credentials,
        authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
        requireUserCredentials: false,
        allowUserCredentials: false,
    };
};
