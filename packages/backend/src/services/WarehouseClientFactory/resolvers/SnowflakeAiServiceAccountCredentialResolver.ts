import {
    assertUnreachable,
    ParameterError,
    SnowflakeAuthenticationType,
    WarehouseTypes,
    type CreateSnowflakeCredentials,
    type CreateWarehouseCredentials,
    type SshTunnelConfiguration,
} from '@lightdash/common';
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
    CreateSnowflakeCredentials,
    AiServiceAccountSecrets
>;

export class SnowflakeAiServiceAccountCredentialResolver implements CredentialResolver<
    CreateSnowflakeCredentials,
    AiServiceAccountSecrets
> {
    buildCredentials(
        connection: CreateWarehouseCredentials & SshTunnelConfiguration,
        secrets: AiServiceAccountSecrets,
    ): CreateSnowflakeCredentials {
        if (connection.type !== WarehouseTypes.SNOWFLAKE) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.SNOWFLAKE)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        return {
            ...pickRoutingFields(WarehouseTypes.SNOWFLAKE, connection),
            ...credentials,
            authenticationType: SnowflakeAuthenticationType.PRIVATE_KEY,
            requireUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateSnowflakeCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<CreateSnowflakeCredentials, AiServiceAccountSecrets>
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
    ): Promise<CredentialResolution<CreateSnowflakeCredentials>> {
        if (input.owner !== null && input.owner.kind !== 'aiServiceAccount') {
            throw new ParameterError(
                'Invalid AI service account credential owner.',
            );
        }
        return {
            clientCredentials: this.buildCredentials(
                input.connection,
                input.stored,
            ),
            clientOptions: {},
            cacheable: input.owner !== null,
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
