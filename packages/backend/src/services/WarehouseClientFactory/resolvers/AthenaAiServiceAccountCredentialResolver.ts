import {
    assertUnreachable,
    AthenaAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type CreateAthenaCredentials,
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
    CreateAthenaCredentials,
    AiServiceAccountSecrets
>;

export class AthenaAiServiceAccountCredentialResolver implements CredentialResolver<
    CreateAthenaCredentials,
    AiServiceAccountSecrets
> {
    readonly supportedMethods = [AthenaAuthenticationType.ACCESS_KEY] as const;

    buildCredentials(
        connection: CreateWarehouseCredentials & SshTunnelConfiguration,
        secrets: AiServiceAccountSecrets,
    ): CreateAthenaCredentials {
        if (connection.type !== WarehouseTypes.ATHENA) {
            throw new ParameterError(
                'The shared agent account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.ATHENA)
            throw new ParameterError(
                'The shared agent account must match the connection warehouse type.',
            );
        return {
            ...pickRoutingFields(WarehouseTypes.ATHENA, connection),
            ...credentials,
            authenticationType: AthenaAuthenticationType.ACCESS_KEY,
            requireUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateAthenaCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<CreateAthenaCredentials, AiServiceAccountSecrets>
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
    ): Promise<CredentialResolution<CreateAthenaCredentials>> {
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
            cacheable: input.owner !== null && !clientCredentials.sessionToken,
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
