import {
    assertUnreachable,
    ParameterError,
    WarehouseTypes,
    type CreateClickhouseCredentials,
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
    DbtTargetResult,
    ValidatedCredential,
} from '../CredentialResolver';
import { pickRoutingFields } from './aiServiceAccountRoutingFields';

type Selection = CredentialSelection<
    CreateClickhouseCredentials,
    AiServiceAccountSecrets
>;

export class ClickhouseAiServiceAccountCredentialResolver implements CredentialResolver<
    CreateClickhouseCredentials,
    AiServiceAccountSecrets
> {
    readonly supportedMethods = ['password'] as const;

    buildCredentials(
        connection: CreateWarehouseCredentials,
        secrets: AiServiceAccountSecrets,
    ): CreateClickhouseCredentials {
        if (connection.type !== WarehouseTypes.CLICKHOUSE) {
            throw new ParameterError(
                'The shared agent account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.CLICKHOUSE)
            throw new ParameterError(
                'The shared agent account must match the connection warehouse type.',
            );
        if (!connection.host?.trim())
            throw new ParameterError(
                'Set the ClickHouse host before adding a shared agent account.',
            );
        return {
            ...pickRoutingFields(WarehouseTypes.CLICKHOUSE, connection),
            user: credentials.user,
            password: credentials.password,
            requireUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateClickhouseCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<
            CreateClickhouseCredentials,
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
                    'A shared agent account cannot use a person sign-in.',
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
    ): Promise<CredentialResolution<CreateClickhouseCredentials>> {
        if (input.owner !== null && input.owner.kind !== 'aiServiceAccount') {
            throw new ParameterError(
                'Invalid shared agent account credential owner.',
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
                'Invalid shared agent account credential owner.',
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
            reason: "Shared agent account credentials cannot run dbt. Use the connection's key or a person's sign-in instead.",
        };
    }

    async dispose(): Promise<void> {}
}
