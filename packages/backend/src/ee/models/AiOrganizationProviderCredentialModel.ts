import {
    AiProviderCredential,
    AiProviderCredentialConfig,
    CreateAiProviderCredential,
    MULTI_CREDENTIAL_AI_PROVIDERS,
    MultiCredentialAiProvider,
    NotFoundError,
    ParameterError,
    UpdateAiProviderCredential,
} from '@lightdash/common';
import { Knex } from 'knex';
import { z } from 'zod';
import Logger from '../../logging/logger';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AiOrganizationProviderCredentialTable,
    AiOrganizationProviderCredentialTableName,
    DbAiOrganizationProviderCredential,
    ProjectAiSettingsTable,
    ProjectAiSettingsTableName,
} from '../database/entities/ai';
import { buildProviderApiKeyHint } from './AiOrganizationSettingsModel';

type Dependencies = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export const credentialConfigSchema = z.object({
    apiKey: z.string().min(1),
    region: z.string().min(1),
    allowedModels: z.array(z.string()).min(1),
});

export const isMultiCredentialAiProvider = (
    provider: string,
): provider is MultiCredentialAiProvider =>
    (MULTI_CREDENTIAL_AI_PROVIDERS as readonly string[]).includes(provider);

export const parseCredentialConfig = (
    value: unknown,
): AiProviderCredentialConfig | null => {
    const parsed = credentialConfigSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
};

/**
 * A credential row whose ciphertext could not be read. Reported rather than
 * swallowed so callers fail closed instead of silently falling back to another
 * region's credential.
 */
export type UnreadableCredential = {
    uuid: string;
    label: string;
};

export type DecryptedAiProviderCredential = {
    uuid: string;
    organizationUuid: string;
    provider: MultiCredentialAiProvider;
    label: string;
    isDefault: boolean;
    config: AiProviderCredentialConfig;
};

/**
 * Outcome of resolving the credential that should serve a request.
 *
 * `none` and `unreadable` must stay distinct: `none` means the organization or
 * project never selected a credential, so falling back is correct, while
 * `unreadable` means one *was* selected and cannot be read. Collapsing the two
 * into null lets a broken credential fall back to another region's key, which
 * is the opposite of what a data-residency pin is for.
 */
export type AiProviderCredentialResolution =
    | { status: 'none' }
    | { status: 'ok'; credential: DecryptedAiProviderCredential }
    | { status: 'unreadable'; uuid: string; label: string };

export const toApiCredential = (
    row: Pick<
        DbAiOrganizationProviderCredential,
        | 'ai_organization_provider_credential_uuid'
        | 'provider'
        | 'label'
        | 'is_default'
    >,
    config: AiProviderCredentialConfig,
): AiProviderCredential | null => {
    if (!isMultiCredentialAiProvider(row.provider)) return null;
    return {
        uuid: row.ai_organization_provider_credential_uuid,
        provider: row.provider,
        label: row.label,
        region: config.region,
        allowedModels: config.allowedModels,
        apiKeyHint: buildProviderApiKeyHint(config.apiKey),
        isDefault: row.is_default,
    };
};

export class AiOrganizationProviderCredentialModel {
    private database: Knex;

    private encryptionUtil: EncryptionUtil;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
        this.encryptionUtil = dependencies.encryptionUtil;
    }

    private decryptConfig(
        encrypted: Buffer,
    ): AiProviderCredentialConfig | null {
        try {
            return parseCredentialConfig(
                JSON.parse(this.encryptionUtil.decrypt(encrypted)),
            );
        } catch {
            return null;
        }
    }

    private encryptConfig(config: AiProviderCredentialConfig): Buffer {
        return this.encryptionUtil.encrypt(JSON.stringify(config));
    }

    /**
     * Credentials an admin can pick from. A row whose ciphertext cannot be read
     * is reported separately rather than listed, so the UI can prompt for
     * re-entry instead of offering a credential that fails at first use.
     */
    async findAllByOrganizationUuid(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<{
        credentials: AiProviderCredential[];
        unreadable: UnreadableCredential[];
    }> {
        const rows = await database<AiOrganizationProviderCredentialTable>(
            AiOrganizationProviderCredentialTableName,
        )
            .select('*')
            .where('organization_uuid', organizationUuid)
            .orderBy('label', 'asc');

        const credentials: AiProviderCredential[] = [];
        const unreadable: UnreadableCredential[] = [];
        rows.forEach((row) => {
            const resolution = this.resolveRow(row);
            if (resolution.status === 'ok') {
                const credential = toApiCredential(
                    row,
                    resolution.credential.config,
                );
                if (credential) credentials.push(credential);
                return;
            }
            unreadable.push({
                uuid: row.ai_organization_provider_credential_uuid,
                label: row.label,
            });
        });
        return { credentials, unreadable };
    }

    private resolveRow(
        row: DbAiOrganizationProviderCredential,
    ): AiProviderCredentialResolution {
        const config = isMultiCredentialAiProvider(row.provider)
            ? this.decryptConfig(row.encrypted_config)
            : null;
        if (!config) {
            Logger.error(
                `Unreadable AI provider credential ${row.ai_organization_provider_credential_uuid}`,
            );
            return {
                status: 'unreadable',
                uuid: row.ai_organization_provider_credential_uuid,
                label: row.label,
            };
        }
        return {
            status: 'ok',
            credential: {
                uuid: row.ai_organization_provider_credential_uuid,
                organizationUuid: row.organization_uuid,
                provider: row.provider as MultiCredentialAiProvider,
                label: row.label,
                isDefault: row.is_default,
                config,
            },
        };
    }

    /**
     * Decrypted credential for use at request time. Scoped by organization so a
     * uuid belonging to another org can never resolve.
     */
    async findDecrypted(
        organizationUuid: string,
        credentialUuid: string,
        database: Knex = this.database,
    ): Promise<AiProviderCredentialResolution> {
        const row = await database<AiOrganizationProviderCredentialTable>(
            AiOrganizationProviderCredentialTableName,
        )
            .select('*')
            .where('organization_uuid', organizationUuid)
            .andWhere(
                'ai_organization_provider_credential_uuid',
                credentialUuid,
            )
            .first();
        return row ? this.resolveRow(row) : { status: 'none' };
    }

    /** Credential serving AI paths with no project or agent in scope. */
    async findDefaultDecrypted(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<AiProviderCredentialResolution> {
        const row = await database<AiOrganizationProviderCredentialTable>(
            AiOrganizationProviderCredentialTableName,
        )
            .select('*')
            .where('organization_uuid', organizationUuid)
            .andWhere('is_default', true)
            .first();
        return row ? this.resolveRow(row) : { status: 'none' };
    }

    /**
     * Credential a project's AI features run on: the project's own pin when it
     * has one, otherwise the organization default. Scoped by organization so a
     * pin that somehow references another org's credential cannot resolve.
     */
    async findForProjectDecrypted(
        organizationUuid: string,
        projectUuid: string,
        database: Knex = this.database,
    ): Promise<AiProviderCredentialResolution> {
        const row = await database(`${ProjectAiSettingsTableName} as s`)
            .innerJoin(
                `${AiOrganizationProviderCredentialTableName} as c`,
                'c.ai_organization_provider_credential_uuid',
                's.ai_organization_provider_credential_uuid',
            )
            .select<DbAiOrganizationProviderCredential>('c.*')
            .where('s.project_uuid', projectUuid)
            .andWhere('c.organization_uuid', organizationUuid)
            .first();

        // An unreadable pin is reported as such rather than falling through to
        // the organization default, which would be a different region.
        if (row) return this.resolveRow(row);
        return this.findDefaultDecrypted(organizationUuid, database);
    }

    async findProjectCredentialUuid(
        projectUuid: string,
        database: Knex = this.database,
    ): Promise<string | null> {
        const row = await database<ProjectAiSettingsTable>(
            ProjectAiSettingsTableName,
        )
            .select('ai_organization_provider_credential_uuid')
            .where('project_uuid', projectUuid)
            .first();
        return row?.ai_organization_provider_credential_uuid ?? null;
    }

    /**
     * Pin a project to a credential, or clear the pin with null so the project
     * follows the organization default again.
     */
    async setProjectCredential(
        projectUuid: string,
        credentialUuid: string | null,
        database: Knex = this.database,
    ): Promise<void> {
        await database<ProjectAiSettingsTable>(ProjectAiSettingsTableName)
            .insert({
                project_uuid: projectUuid,
                ai_organization_provider_credential_uuid: credentialUuid,
            })
            .onConflict('project_uuid')
            .merge({
                ai_organization_provider_credential_uuid: credentialUuid,
                updated_at: database.raw('NOW()'),
            });
    }

    /**
     * Projects pinned to a credential. The delete path reports these instead of
     * letting the FK error surface, so an admin is told which projects to
     * repoint rather than seeing a constraint violation.
     */
    async findProjectUuidsUsingCredential(
        credentialUuid: string,
        database: Knex = this.database,
    ): Promise<string[]> {
        const rows = await database<ProjectAiSettingsTable>(
            ProjectAiSettingsTableName,
        )
            .select('project_uuid')
            .where('ai_organization_provider_credential_uuid', credentialUuid);
        return rows.map((row) => row.project_uuid);
    }

    async countByOrganizationUuid(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<number> {
        const [row] = await database(AiOrganizationProviderCredentialTableName)
            .where('organization_uuid', organizationUuid)
            .count({ count: '*' });
        return Number(row?.count ?? 0);
    }

    async create(
        organizationUuid: string,
        createdByUserUuid: string | null,
        data: CreateAiProviderCredential,
    ): Promise<string> {
        const label = data.label.trim();
        if (label.length === 0) {
            throw new ParameterError('Credential label cannot be empty');
        }
        const config = credentialConfigSchema.parse({
            apiKey: data.apiKey.trim(),
            region: data.region,
            allowedModels: data.allowedModels,
        });

        return this.database.transaction(async (trx) => {
            // First credential becomes the default, so an org is never left
            // with credentials but nothing serving its unscoped AI paths.
            const existingCount = await this.countByOrganizationUuid(
                organizationUuid,
                trx,
            );

            const [row] = await trx<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .insert({
                    organization_uuid: organizationUuid,
                    provider: data.provider,
                    label,
                    encrypted_config: this.encryptConfig(config),
                    is_default: existingCount === 0,
                    created_by_user_uuid: createdByUserUuid,
                })
                .onConflict(['organization_uuid', 'label'])
                .ignore()
                .returning('ai_organization_provider_credential_uuid');

            if (!row) {
                throw new ParameterError(
                    `A credential named "${label}" already exists in this organization`,
                );
            }
            return row.ai_organization_provider_credential_uuid;
        });
    }

    async update(
        organizationUuid: string,
        credentialUuid: string,
        data: UpdateAiProviderCredential,
    ): Promise<void> {
        const resolution = await this.findDecrypted(
            organizationUuid,
            credentialUuid,
        );
        if (resolution.status === 'none') {
            throw new NotFoundError('AI provider credential not found');
        }
        // A partial edit has to merge with the stored config, which an
        // unreadable row cannot supply. `replace` is the way back.
        if (resolution.status === 'unreadable') {
            throw new ParameterError(
                'This credential cannot be read with the current encryption secret. Replace it with a complete configuration instead.',
            );
        }
        const existing = resolution.credential;

        const label = data.label?.trim() ?? existing.label;
        if (label.length === 0) {
            throw new ParameterError('Credential label cannot be empty');
        }
        const config = credentialConfigSchema.parse({
            apiKey: data.apiKey?.trim() ?? existing.config.apiKey,
            region: data.region ?? existing.config.region,
            allowedModels: data.allowedModels ?? existing.config.allowedModels,
        });

        const updated =
            await this.database<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .where('organization_uuid', organizationUuid)
                .andWhere(
                    'ai_organization_provider_credential_uuid',
                    credentialUuid,
                )
                .update({
                    label,
                    encrypted_config: this.encryptConfig(config),
                    updated_at: this.database.raw('NOW()'),
                });

        if (updated === 0) {
            throw new NotFoundError('AI provider credential not found');
        }
    }

    /**
     * Overwrite a credential wholesale. Unlike `update` this never reads the
     * stored ciphertext, so it is the way to repair a row that can no longer be
     * decrypted: every field must be supplied, and only the row's existence is
     * checked.
     */
    async replace(
        organizationUuid: string,
        credentialUuid: string,
        data: CreateAiProviderCredential,
    ): Promise<void> {
        const label = data.label.trim();
        if (label.length === 0) {
            throw new ParameterError('Credential label cannot be empty');
        }
        const config = credentialConfigSchema.parse({
            apiKey: data.apiKey.trim(),
            region: data.region,
            allowedModels: data.allowedModels,
        });

        const updated =
            await this.database<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .where('organization_uuid', organizationUuid)
                .andWhere(
                    'ai_organization_provider_credential_uuid',
                    credentialUuid,
                )
                .update({
                    label,
                    encrypted_config: this.encryptConfig(config),
                    updated_at: this.database.raw('NOW()'),
                });

        if (updated === 0) {
            throw new NotFoundError('AI provider credential not found');
        }
    }

    /**
     * Deleting the default promotes the next credential by label, so an org
     * with credentials left always has one serving its unscoped paths.
     */
    async delete(
        organizationUuid: string,
        credentialUuid: string,
    ): Promise<void> {
        await this.database.transaction(async (trx) => {
            // Checked before the delete so the admin gets the project list
            // rather than an opaque foreign-key violation.
            const pinnedProjects = await this.findProjectUuidsUsingCredential(
                credentialUuid,
                trx,
            );
            if (pinnedProjects.length > 0) {
                throw new ParameterError(
                    `This credential is still used by ${pinnedProjects.length} project(s). Point them at another credential before deleting it.`,
                );
            }

            const [deleted] = await trx<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .where('organization_uuid', organizationUuid)
                .andWhere(
                    'ai_organization_provider_credential_uuid',
                    credentialUuid,
                )
                .delete()
                .returning('is_default');

            if (!deleted) {
                throw new NotFoundError('AI provider credential not found');
            }
            if (!deleted.is_default) return;

            const next = await trx(AiOrganizationProviderCredentialTableName)
                .select('ai_organization_provider_credential_uuid')
                .where('organization_uuid', organizationUuid)
                .orderBy('label', 'asc')
                .first();
            if (!next) return;

            await trx<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .where(
                    'ai_organization_provider_credential_uuid',
                    next.ai_organization_provider_credential_uuid,
                )
                .update({
                    is_default: true,
                    updated_at: this.database.raw('NOW()'),
                });
        });
    }

    async setDefault(
        organizationUuid: string,
        credentialUuid: string,
    ): Promise<void> {
        const resolution = await this.findDecrypted(
            organizationUuid,
            credentialUuid,
        );
        if (resolution.status === 'none') {
            throw new NotFoundError('AI provider credential not found');
        }
        if (resolution.status === 'unreadable') {
            throw new ParameterError(
                'This credential cannot be read with the current encryption secret, so it cannot serve requests. Replace it before making it the default.',
            );
        }

        await this.database.transaction(async (trx) => {
            // Clear first: a partial unique index allows only one default per
            // organization, so both statements must land in one transaction.
            await trx<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .where('organization_uuid', organizationUuid)
                .andWhere('is_default', true)
                .update({
                    is_default: false,
                    updated_at: this.database.raw('NOW()'),
                });

            const updated = await trx<AiOrganizationProviderCredentialTable>(
                AiOrganizationProviderCredentialTableName,
            )
                .where('organization_uuid', organizationUuid)
                .andWhere(
                    'ai_organization_provider_credential_uuid',
                    credentialUuid,
                )
                .update({
                    is_default: true,
                    updated_at: this.database.raw('NOW()'),
                });

            if (updated === 0) {
                throw new NotFoundError('AI provider credential not found');
            }
        });
    }
}
