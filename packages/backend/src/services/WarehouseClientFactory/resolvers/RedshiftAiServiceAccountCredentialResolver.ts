import {
    assertUnreachable,
    ParameterError,
    RedshiftAuthenticationType,
    WarehouseTypes,
    type CreateRedshiftCredentials,
    type CreateWarehouseCredentials,
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
    CreateRedshiftCredentials,
    AiServiceAccountSecrets
>;

export class RedshiftAiServiceAccountCredentialResolver implements CredentialResolver<
    CreateRedshiftCredentials,
    AiServiceAccountSecrets
> {
    readonly supportedMethods = ['password'] as const;

    buildCredentials(
        connection: CreateWarehouseCredentials,
        secrets: AiServiceAccountSecrets,
    ): CreateRedshiftCredentials {
        if (connection.type !== WarehouseTypes.REDSHIFT) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.REDSHIFT)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        if (!connection.host?.trim())
            throw new ParameterError(
                'Set the Redshift host before adding an AI service account.',
            );
        return {
            ...pickRoutingFields(WarehouseTypes.REDSHIFT, connection),
            authenticationType: RedshiftAuthenticationType.PASSWORD,
            user: credentials.user,
            password: credentials.password,
            requireUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateRedshiftCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<CreateRedshiftCredentials, AiServiceAccountSecrets>
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
    ): Promise<CredentialResolution<CreateRedshiftCredentials>> {
        if (input.owner !== null && input.owner.kind !== 'aiServiceAccount') {
            throw new ParameterError(
                'Invalid AI service account credential owner.',
            );
        }
        const clientCredentials = this.buildCredentials(
            input.connection,
            input.stored,
        );
        return {
            clientCredentials,
            clientOptions: {},
            cacheable: input.owner !== null,
            agentSignIn: null,
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
