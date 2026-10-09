import {
    assertUnreachable,
    BigqueryAuthenticationType,
    ParameterError,
    WarehouseTypes,
    type CreateBigqueryCredentials,
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
    CreateBigqueryCredentials,
    AiServiceAccountSecrets
>;

export class BigqueryAiServiceAccountCredentialResolver implements CredentialResolver<
    CreateBigqueryCredentials,
    AiServiceAccountSecrets
> {
    readonly supportedMethods = [
        BigqueryAuthenticationType.PRIVATE_KEY,
    ] as const;

    buildCredentials(
        connection: CreateWarehouseCredentials & SshTunnelConfiguration,
        secrets: AiServiceAccountSecrets,
    ): CreateBigqueryCredentials {
        if (connection.type !== WarehouseTypes.BIGQUERY) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        const credentials = parseAiServiceAccountSecrets(secrets);
        if (credentials.type !== WarehouseTypes.BIGQUERY) {
            throw new ParameterError(
                'The AI service account must match the connection warehouse type.',
            );
        }
        return {
            ...pickRoutingFields(WarehouseTypes.BIGQUERY, connection),
            ...credentials,
            authenticationType: BigqueryAuthenticationType.PRIVATE_KEY,
            requireUserCredentials: false,
            allowUserCredentials: false,
        };
    }

    async validateOnSave(
        input: CredentialSaveInput<
            CreateBigqueryCredentials,
            AiServiceAccountSecrets
        >,
    ): Promise<
        ValidatedCredential<CreateBigqueryCredentials, AiServiceAccountSecrets>
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
    ): Promise<CredentialResolution<CreateBigqueryCredentials>> {
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
            agentSignIn: null,
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
