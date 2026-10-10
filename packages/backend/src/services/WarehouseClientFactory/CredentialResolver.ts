import type {
    AiAssurance,
    AiExecutionPlan,
    CreateWarehouseCredentials,
    UserWarehouseCredentialPurpose,
    UserWarehouseCredentialsWithSecrets,
} from '@lightdash/common';
import type { WarehouseClientOptions } from '@lightdash/warehouses';
import type { PersonalCredentialPersistencePolicy } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import type { WarehouseCredentialKind } from './ConnectionContext';
import type { WarehouseCredentialResolutionContext } from './WarehouseCredentialSource';

export type CredentialOwner =
    | { kind: 'project'; uuid: string }
    | { kind: 'organization'; uuid: string }
    | { kind: 'user'; uuid: string; purpose: UserWarehouseCredentialPurpose }
    | { kind: 'warehouseConnection'; uuid: string }
    | {
          kind: 'aiServiceAccount';
          uuid: string;
          identityUuid: string;
          sourceProjectUuid: string;
      };

export type CredentialRefreshSource = {
    credentials:
        | CreateWarehouseCredentials
        | UserWarehouseCredentialsWithSecrets['credentials'];
    fallback: CreateWarehouseCredentials;
    personalCredentialPolicy: PersonalCredentialPersistencePolicy;
};

export type CredentialSelectionSource =
    | {
          owner: CredentialOwner | null;
          refreshSource: CredentialRefreshSource;
      }
    | {
          owner: Exclude<CredentialOwner, { kind: 'user' }> | null;
          refreshSource?: CredentialRefreshSource;
      };

export type CredentialSelection<C, S = C> = CredentialSelectionSource & {
    connection: C;
    stored: S;
    context: WarehouseCredentialResolutionContext;
    projectUuid: string | null;
    warehouseConnectionUuid: string | null;
    credentialKind: WarehouseCredentialKind;
    aiPlan: AiExecutionPlan | null;
};

export type SaveIntent =
    | { kind: 'preserve' }
    | { kind: 'linkCurrentPerson'; userUuid: string }
    | { kind: 'verifiedGoogleCallback'; refreshToken: string };

export type CredentialSaveInput<C, S = C> = CredentialSelection<C, S> & {
    intent: SaveIntent;
};
export type ValidatedCredential<C, S = C> = { connection: C; stored: S };
export type AgentSignInResolutionMetadata = {
    credentialUuid: string;
    assurances: AiAssurance[];
    expiresAt: Date | null;
    clientVersion: string | null;
};

export type CredentialResolution<C> = {
    agentSignIn: AgentSignInResolutionMetadata | null;
    clientCredentials: C;
    clientOptions: Partial<WarehouseClientOptions>;
    cacheable: boolean;
};

export interface CredentialResolver<
    C extends CreateWarehouseCredentials,
    S = C,
> {
    validateOnSave(
        input: CredentialSaveInput<C, S>,
    ): Promise<ValidatedCredential<C, S>>;
    resolve(input: CredentialSelection<C, S>): Promise<CredentialResolution<C>>;
    cacheKeyIdentity(
        input: CredentialSelection<C, S>,
        resolved: CredentialResolution<C>,
    ): readonly (string | null)[];
    dispose(resolved: CredentialResolution<C>): Promise<void>;
}

export type MaterializedCredential = {
    agentSignIn: AgentSignInResolutionMetadata | null;
    clientOptions: Partial<WarehouseClientOptions>;
    cacheable: boolean;
    cacheKeyIdentity: readonly (string | null)[];
    dispose: () => Promise<void>;
};

export const credentialResolution = Symbol('credentialResolution');
export type MaterializedCredentials = CreateWarehouseCredentials & {
    [credentialResolution]?: MaterializedCredential;
};

export const preparedCredentials = Symbol('preparedCredentials');
export type PreparedCredentials = CreateWarehouseCredentials & {
    [preparedCredentials]?: true;
};
