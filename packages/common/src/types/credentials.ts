import { type WarehouseTypes } from './projects';

export type CredentialOwnerKind = 'organization' | 'connection' | 'person';

export const credentialPurposeOwnerKinds = {
    shared_login: ['organization', 'connection'],
    ai_service_account: ['connection'],
    delivery_service_account: ['connection'],
    embed_service_account: ['connection'],
    automation_service_account: ['connection'],
    personal_sign_in: ['person'],
    agent_sign_in: ['person'],
    agent_oauth_client: ['organization'],
    ssh_key_pair: ['organization'],
    git_installation: ['organization'],
    git_user: ['person'],
    dbt_cloud: ['connection'],
    dbt_git: ['connection'],
    dbt_environment: ['connection'],
    external_source: ['connection'],
} as const satisfies Record<string, readonly CredentialOwnerKind[]>;

export type CredentialPurpose = keyof typeof credentialPurposeOwnerKinds;

export type CredentialSlot =
    | 'shared_login'
    | 'ai_service_account'
    | 'delivery_service_account'
    | 'embed_service_account'
    | 'automation_service_account'
    | 'personal_sign_in'
    | 'agent_sign_in';

export type CredentialMetadata = {
    uuid: string;
    organizationUuid: string;
    ownerKind: CredentialOwnerKind;
    ownerUserUuid: string | null;
    ownerProjectUuid: string | null;
    ownerWarehouseConnectionUuid: string | null;
    purpose: CredentialPurpose;
    warehouseType: WarehouseTypes | null;
    authMode: string;
    subjectUserUuid: string | null;
    subjectLabel: string | null;
    issuerCredentialUuid: string | null;
    oauthGrantUuid: string | null;
    generation: string;
    expiresAt: Date | null;
    rotatedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
};
