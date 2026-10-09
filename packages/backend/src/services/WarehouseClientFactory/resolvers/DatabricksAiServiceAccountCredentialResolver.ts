import {
    assertUnreachable,
    DatabricksAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type CreateDatabricksCredentials,
    type CreateWarehouseCredentials,
} from '@lightdash/common';
import { exchangeDatabricksOAuthCredentials } from '@lightdash/warehouses';
import {
    parseAiServiceAccountSecrets,
    type AiServiceAccountSecrets,
} from '../../../models/AiServiceAccountCredentialsModel/AiServiceAccountCredentialsModel';
import type {
    CredentialResolution,
    CredentialResolver,
    CredentialSaveInput,
    CredentialSelection,
    ValidatedCredential,
} from '../CredentialResolver';
import { pickRoutingFields } from './aiServiceAccountRoutingFields';

type Selection = CredentialSelection<
    CreateDatabricksCredentials,
    AiServiceAccountSecrets
>;

export class DatabricksAiServiceAccountCredentialResolver implements CredentialResolver<
    CreateDatabricksCredentials,
    AiServiceAccountSecrets
> {
    readonly supportedMethods = [
        DatabricksAuthenticationType.OAUTH_M2M,
    ] as const;

    buildCredentials(
        connection: CreateWarehouseCredentials,
        secrets: AiServiceAccountSecrets,
    ): CreateDatabricksCredentials {
        if (connection.type !== WarehouseTypes.DATABRICKS) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.DATABRICKS) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        return {
            ...pickRoutingFields(WarehouseTypes.DATABRICKS, connection),
            ...credentials,
            authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
            requireUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateDatabricksCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<
            CreateDatabricksCredentials,
            AiServiceAccountSecrets
        >
    > {
        const { intent } = input;
        switch (intent.kind) {
            case 'preserve':
                this.buildCredentials(input.connection, input.stored);
                return {
                    connection: input.connection,
                    stored: parseAiServiceAccountSecrets(input.stored),
                };
            case 'linkCurrentPerson':
            case 'verifiedGoogleCallback':
                throw new ParameterError(
                    'An AI service account cannot use a person sign-in.',
                );
            default:
                return assertUnreachable(
                    intent,
                    'Unknown credential save intent',
                );
        }
    }

    async resolve(
        input: Selection,
    ): Promise<CredentialResolution<CreateDatabricksCredentials>> {
        if (input.owner !== null && input.owner.kind !== 'aiServiceAccount') {
            throw new ParameterError(
                'Invalid AI service account credential owner.',
            );
        }
        const credentials = this.buildCredentials(
            input.connection,
            input.stored,
        );
        const { accessToken } = await exchangeDatabricksOAuthCredentials(
            credentials.serverHostName,
            credentials.oauthClientId!,
            credentials.oauthClientSecret!,
        );
        if (typeof accessToken !== 'string' || !accessToken.trim()) {
            throw new ParameterError(
                'The AI service account did not return an access token.',
            );
        }
        return {
            clientCredentials: { ...credentials, token: accessToken },
            clientOptions: {},
            agentSignIn: null,
            cacheable: false,
        };
    }

    cacheKeyIdentity(input: Selection): readonly (string | null)[] {
        const { owner } = input;
        if (owner !== null && owner.kind !== 'aiServiceAccount') {
            throw new ParameterError(
                'Invalid AI service account credential owner.',
            );
        }
        return [
            'ai-service-account-v1',
            input.connection.type,
            owner?.uuid ?? null,
            owner?.identityUuid ?? null,
            owner?.sourceProjectUuid ?? null,
        ];
    }

    async dispose(): Promise<void> {}
}
