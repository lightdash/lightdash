import {
    assertUnreachable,
    ParameterError,
    WarehouseTypes,
    type CreatePostgresCredentials,
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
    DbtTargetResult,
    ValidatedCredential,
} from '../CredentialResolver';
import { pickRoutingFields } from './aiServiceAccountRoutingFields';

type Selection = CredentialSelection<
    CreatePostgresCredentials,
    AiServiceAccountSecrets
>;

export class PostgresAiServiceAccountCredentialResolver implements CredentialResolver<
    CreatePostgresCredentials,
    AiServiceAccountSecrets
> {
    readonly supportedMethods = ['password'] as const;

    buildCredentials(
        connection: CreateWarehouseCredentials & SshTunnelConfiguration,
        secrets: AiServiceAccountSecrets,
    ): CreatePostgresCredentials {
        if (connection.type !== WarehouseTypes.POSTGRES) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.POSTGRES)
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        return {
            ...pickRoutingFields(WarehouseTypes.POSTGRES, connection),
            user: credentials.user,
            password: credentials.password,
            requireUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreatePostgresCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<CreatePostgresCredentials, AiServiceAccountSecrets>
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
    ): Promise<CredentialResolution<CreatePostgresCredentials>> {
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

    toDbtTarget(): DbtTargetResult {
        return {
            kind: 'none',
            reason: "AI service account credentials cannot run dbt. Use the connection's key or a person's sign-in instead.",
        };
    }

    async dispose(): Promise<void> {}
}
