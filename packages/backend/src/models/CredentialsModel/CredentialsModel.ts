import {
    NotFoundError,
    OpenIdIdentityIssuerType,
    ParameterError,
    type CredentialMetadata,
    type CredentialSlot,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { type DbCredentials } from '../../database/entities/credentials';
import { type EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { CredentialCodec } from './credentialCodec';

const metadataColumns = [
    'credential_uuid',
    'organization_uuid',
    'owner_kind',
    'owner_user_uuid',
    'owner_project_uuid',
    'owner_warehouse_connection_uuid',
    'purpose',
    'warehouse_type',
    'auth_mode',
    'subject_user_uuid',
    'subject_label',
    'issuer_credential_uuid',
    'oauth_grant_uuid',
    'generation',
    'expires_at',
    'rotated_at',
    'created_at',
    'updated_at',
    'created_by_user_uuid',
    'updated_by_user_uuid',
] as const;

type DbCredentialMetadata = Pick<
    DbCredentials,
    (typeof metadataColumns)[number]
>;

const toMetadata = (row: DbCredentialMetadata): CredentialMetadata => ({
    uuid: row.credential_uuid,
    organizationUuid: row.organization_uuid,
    ownerKind: row.owner_kind,
    ownerUserUuid: row.owner_user_uuid,
    ownerProjectUuid: row.owner_project_uuid,
    ownerWarehouseConnectionUuid: row.owner_warehouse_connection_uuid,
    purpose: row.purpose,
    warehouseType: row.warehouse_type,
    authMode: row.auth_mode,
    subjectUserUuid: row.subject_user_uuid,
    subjectLabel: row.subject_label,
    issuerCredentialUuid: row.issuer_credential_uuid,
    oauthGrantUuid: row.oauth_grant_uuid,
    generation: row.generation,
    expiresAt: row.expires_at,
    rotatedAt: row.rotated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdByUserUuid: row.created_by_user_uuid,
    updatedByUserUuid: row.updated_by_user_uuid,
});

export type CreateCredential = Omit<
    CredentialMetadata,
    'uuid' | 'generation' | 'rotatedAt' | 'createdAt' | 'updatedAt'
> & {
    identity: unknown;
    secrets: unknown;
};

export type CredentialBindingKey = {
    projectUuid: string;
    warehouseConnectionUuid: string | null;
    slot: CredentialSlot;
    userUuid: string | null;
};

const bindingWhere = (key: CredentialBindingKey) => ({
    project_uuid: key.projectUuid,
    warehouse_connection_uuid: key.warehouseConnectionUuid,
    slot: key.slot,
    user_uuid: key.userUuid,
});

const validateVersion = (version: string): string => {
    if (
        !/^(0|[1-9][0-9]*)$/.test(version) ||
        BigInt(version) > 9223372036854775807n
    ) {
        throw new Error(
            'Credential token version must be a nonnegative bigint.',
        );
    }
    return version;
};

export class CredentialsModel {
    private readonly database: Knex;

    private readonly codec: CredentialCodec;

    constructor({
        database,
        encryptionUtil,
    }: {
        database: Knex;
        encryptionUtil: EncryptionUtil;
    }) {
        this.database = database;
        this.codec = new CredentialCodec(encryptionUtil);
    }

    async create(input: CreateCredential): Promise<CredentialMetadata> {
        const encoded = this.codec.encodeCredential(input);
        return this.database.transaction(async (trx) => {
            if (input.ownerProjectUuid !== null) {
                const project = await trx('projects')
                    .join(
                        'organizations',
                        'projects.organization_id',
                        'organizations.organization_id',
                    )
                    .select('organizations.organization_uuid')
                    .where('projects.project_uuid', input.ownerProjectUuid)
                    .forShare('projects')
                    .first();
                if (
                    !project ||
                    project.organization_uuid !== input.organizationUuid
                ) {
                    throw new ParameterError(
                        'Credential and owner project must belong to the same organization.',
                    );
                }
            }
            if (input.oauthGrantUuid !== null) {
                const grant = await trx('user_oauth_grants')
                    .select('user_uuid', 'provider')
                    .where('user_oauth_grant_uuid', input.oauthGrantUuid)
                    .forShare()
                    .first();
                if (
                    input.ownerKind !== 'person' ||
                    !grant ||
                    grant.user_uuid !== input.ownerUserUuid ||
                    grant.provider !== OpenIdIdentityIssuerType.GOOGLE
                ) {
                    throw new ParameterError(
                        'OAuth grant must be a Google grant belonging to the credential owner.',
                    );
                }
            }
            if (input.issuerCredentialUuid !== null) {
                const issuer = await trx('credentials')
                    .select('purpose', 'organization_uuid', 'warehouse_type')
                    .where('credential_uuid', input.issuerCredentialUuid)
                    .forShare()
                    .first();
                if (
                    !issuer ||
                    issuer.purpose !== 'agent_oauth_client' ||
                    issuer.organization_uuid !== input.organizationUuid ||
                    issuer.warehouse_type !== input.warehouseType
                ) {
                    throw new ParameterError(
                        'Issuer must be an agent OAuth client in the same organization and warehouse type.',
                    );
                }
            }
            const [row] = await trx('credentials')
                .insert({
                    organization_uuid: input.organizationUuid,
                    owner_kind: input.ownerKind,
                    owner_user_uuid: input.ownerUserUuid,
                    owner_project_uuid: input.ownerProjectUuid,
                    owner_warehouse_connection_uuid:
                        input.ownerWarehouseConnectionUuid,
                    purpose: input.purpose,
                    warehouse_type: input.warehouseType,
                    auth_mode: input.authMode,
                    subject_user_uuid: input.subjectUserUuid,
                    subject_label: input.subjectLabel,
                    issuer_credential_uuid: input.issuerCredentialUuid,
                    oauth_grant_uuid: input.oauthGrantUuid,
                    expires_at: input.expiresAt,
                    created_by_user_uuid: input.createdByUserUuid,
                    updated_by_user_uuid: input.updatedByUserUuid,
                    identity: encoded.identity,
                    encrypted_secrets: encoded.encryptedSecrets,
                    generation: randomUUID(),
                })
                .returning([...metadataColumns]);
            return toMetadata(row);
        });
    }

    async getMetadata(uuid: string): Promise<CredentialMetadata> {
        const row = await this.database('credentials')
            .select([...metadataColumns])
            .where('credential_uuid', uuid)
            .first();
        if (!row) throw new NotFoundError('Credential not found.');
        return toMetadata(row);
    }

    async getIdentity(uuid: string): Promise<Record<string, unknown>> {
        const row = await this.database('credentials')
            .select('identity')
            .where('credential_uuid', uuid)
            .first();
        if (!row) throw new NotFoundError('Credential not found.');
        return row.identity;
    }

    async getSecretsForResolution(uuid: string) {
        const row = await this.database('credentials')
            .select(
                'purpose',
                'warehouse_type',
                'auth_mode',
                'encrypted_secrets',
            )
            .where('credential_uuid', uuid)
            .first();
        if (!row) throw new NotFoundError('Credential not found.');
        return this.codec.decodeSecrets(
            {
                purpose: row.purpose,
                warehouseType: row.warehouse_type,
                authMode: row.auth_mode,
            },
            row.encrypted_secrets,
        );
    }

    async replaceSecrets(
        uuid: string,
        secrets: unknown,
        updatedByUserUuid: string | null,
    ): Promise<CredentialMetadata> {
        return this.database.transaction(async (trx) => {
            const row = await trx('credentials')
                .select([...metadataColumns, 'identity'])
                .where('credential_uuid', uuid)
                .forUpdate()
                .first();
            if (!row) throw new NotFoundError('Credential not found.');
            const encoded = this.codec.encodeCredential({
                purpose: row.purpose,
                warehouseType: row.warehouse_type,
                authMode: row.auth_mode,
                identity: row.identity,
                secrets,
            });
            const [updated] = await trx('credentials')
                .where('credential_uuid', uuid)
                .update({
                    encrypted_secrets: encoded.encryptedSecrets,
                    generation: randomUUID(),
                    rotated_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .returning([...metadataColumns]);
            return toMetadata(updated);
        });
    }

    async replaceIdentityAndSecrets(
        uuid: string,
        identity: unknown,
        secrets: unknown,
        updatedByUserUuid: string | null,
    ): Promise<CredentialMetadata> {
        return this.database.transaction(async (trx) => {
            const row = await trx('credentials')
                .select([...metadataColumns])
                .where('credential_uuid', uuid)
                .forUpdate()
                .first();
            if (!row) throw new NotFoundError('Credential not found.');
            const encoded = this.codec.encodeCredential({
                purpose: row.purpose,
                warehouseType: row.warehouse_type,
                authMode: row.auth_mode,
                identity,
                secrets,
            });
            const [updated] = await trx('credentials')
                .where('credential_uuid', uuid)
                .update({
                    identity: encoded.identity,
                    encrypted_secrets: encoded.encryptedSecrets,
                    generation: randomUUID(),
                    rotated_at: trx.fn.now(),
                    updated_at: trx.fn.now(),
                    updated_by_user_uuid: updatedByUserUuid,
                })
                .returning([...metadataColumns]);
            await trx('credential_token_state')
                .where('credential_uuid', uuid)
                .update({
                    encrypted_refresh_token: null,
                    refresh_expires_at: null,
                    version: trx.raw('version + 1'),
                    updated_at: trx.fn.now(),
                });
            return toMetadata(updated);
        });
    }

    async delete(uuid: string): Promise<void> {
        await this.database('credentials')
            .where('credential_uuid', uuid)
            .delete();
    }

    async bind(
        key: CredentialBindingKey,
        credentialUuid: string,
        createdByUserUuid: string | null,
    ): Promise<string> {
        return this.database.transaction(async (trx) => {
            const credential = await trx('credentials')
                .select('organization_uuid')
                .where('credential_uuid', credentialUuid)
                .forShare()
                .first();
            if (!credential) throw new NotFoundError('Credential not found.');
            const project = await trx('projects')
                .join(
                    'organizations',
                    'projects.organization_id',
                    'organizations.organization_id',
                )
                .select('organizations.organization_uuid')
                .where('projects.project_uuid', key.projectUuid)
                .forShare()
                .first();
            if (!project) throw new NotFoundError('Project not found.');
            if (credential.organization_uuid !== project.organization_uuid) {
                throw new ParameterError(
                    'Credential and project must belong to the same organization.',
                );
            }
            const [row] = await trx('credential_bindings')
                .insert({
                    ...bindingWhere(key),
                    credential_uuid: credentialUuid,
                    created_by_user_uuid: createdByUserUuid,
                })
                .returning('credential_binding_uuid');
            return row.credential_binding_uuid;
        });
    }

    async unbind(key: CredentialBindingKey): Promise<void> {
        await this.database('credential_bindings')
            .where(bindingWhere(key))
            .delete();
    }

    async findBinding(key: CredentialBindingKey): Promise<string | null> {
        const row = await this.database('credential_bindings')
            .select('credential_uuid')
            .where(bindingWhere(key))
            .first();
        return row?.credential_uuid ?? null;
    }

    async findTokenState(uuid: string) {
        const row = await this.database('credential_token_state')
            .select(
                'credential_uuid',
                'encrypted_refresh_token',
                'refresh_expires_at',
                'version',
                'rotated_at',
                'created_at',
                'updated_at',
            )
            .where('credential_uuid', uuid)
            .first();
        if (!row) return null;
        const decoded =
            row.encrypted_refresh_token === null
                ? null
                : this.codec.decodeRefreshToken(row.encrypted_refresh_token);
        return {
            credentialUuid: row.credential_uuid,
            refreshToken: decoded?.refreshToken ?? null,
            keySource: decoded?.keySource ?? null,
            refreshExpiresAt: row.refresh_expires_at,
            version: validateVersion(row.version),
            rotatedAt: row.rotated_at,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        };
    }

    async upsertTokenState(
        uuid: string,
        refreshToken: string | null,
        refreshExpiresAt: Date | null,
    ): Promise<void> {
        const update = {
            encrypted_refresh_token:
                refreshToken === null
                    ? null
                    : this.codec.encodeRefreshToken(refreshToken),
            refresh_expires_at: refreshExpiresAt,
            rotated_at: new Date(),
            updated_at: new Date(),
        };
        await this.database('credential_token_state')
            .insert({ credential_uuid: uuid, ...update })
            .onConflict('credential_uuid')
            .merge({
                ...update,
                version: this.database.raw(
                    'credential_token_state.version + 1',
                ),
            });
    }

    async compareAndSwapRefreshToken(
        uuid: string,
        expectedVersion: string,
        refreshToken: string | null,
        refreshExpiresAt: Date | null,
    ): Promise<boolean> {
        const changed = await this.database('credential_token_state')
            .where({
                credential_uuid: uuid,
                version: validateVersion(expectedVersion),
            })
            .update({
                encrypted_refresh_token:
                    refreshToken === null
                        ? null
                        : this.codec.encodeRefreshToken(refreshToken),
                refresh_expires_at: refreshExpiresAt,
                version: this.database.raw('version + 1'),
                rotated_at: new Date(),
                updated_at: new Date(),
            });
        return changed === 1;
    }
}
