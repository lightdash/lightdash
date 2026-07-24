import {
    AiOrganizationSettings,
    AiProviderApiKeyHints,
    BYO_AI_PROVIDERS,
    CreateAiOrganizationSettings,
    NotFoundError,
    ParameterError,
    UpdateAiOrganizationSettings,
    UpdateAiProviderApiKeys,
} from '@lightdash/common';
import { Knex } from 'knex';
import Logger from '../../logging/logger';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    AiOrganizationSettingsTable,
    AiOrganizationSettingsTableName,
    DbAiOrganizationSettings,
} from '../database/entities/ai';

type Dependencies = {
    database: Knex;
    encryptionUtil: EncryptionUtil;
};

export type AiOrgProviderApiKeys = {
    anthropic?: string;
    openai?: string;
};

export const applyProviderApiKeyUpdates = (
    existing: AiOrgProviderApiKeys,
    updates: UpdateAiProviderApiKeys,
): AiOrgProviderApiKeys => {
    const next: AiOrgProviderApiKeys = { ...existing };
    BYO_AI_PROVIDERS.forEach((provider) => {
        const update = updates[provider];
        if (update === undefined) return;
        if (update === null) {
            delete next[provider];
            return;
        }
        const trimmed = update.trim();
        if (trimmed.length === 0) {
            throw new ParameterError(`API key for ${provider} cannot be empty`);
        }
        next[provider] = trimmed;
    });
    return next;
};

export const buildProviderApiKeyHint = (key: string): string => {
    const prefix = key.match(/^(sk-ant-[a-z0-9]+-|sk-proj-|sk-)/)?.[0] ?? '';
    const headLength = prefix.length + 3;
    if (key.length < headLength + 8) {
        return `${key.slice(0, 2)}...`;
    }
    return `${key.slice(0, headLength)}...${key.slice(-4)}`;
};

export const buildProviderApiKeyHints = (
    keys: AiOrgProviderApiKeys,
): AiProviderApiKeyHints | null => {
    if (!keys.anthropic && !keys.openai) return null;
    return {
        anthropic: keys.anthropic
            ? buildProviderApiKeyHint(keys.anthropic)
            : null,
        openai: keys.openai ? buildProviderApiKeyHint(keys.openai) : null,
    };
};

export class AiOrganizationSettingsModel {
    private database: Knex;

    private encryptionUtil: EncryptionUtil;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
        this.encryptionUtil = dependencies.encryptionUtil;
    }

    private decryptProviderApiKeys(
        encrypted: Buffer | null,
    ): AiOrgProviderApiKeys {
        if (!encrypted) return {};
        try {
            return JSON.parse(
                this.encryptionUtil.decrypt(encrypted),
            ) as AiOrgProviderApiKeys;
        } catch {
            Logger.warn(
                'Failed to decrypt AI provider API keys; treating as unset',
            );
            return {};
        }
    }

    private encryptProviderApiKeys(keys: AiOrgProviderApiKeys): Buffer | null {
        if (!keys.anthropic && !keys.openai) return null;
        return this.encryptionUtil.encrypt(JSON.stringify(keys));
    }

    private mapDbToEntity(
        db: DbAiOrganizationSettings,
    ): AiOrganizationSettings {
        const keys = this.decryptProviderApiKeys(
            db.encrypted_provider_api_keys,
        );
        return {
            organizationUuid: db.organization_uuid,
            aiAgentsVisible: db.ai_agents_visible,
            aiAgentReviewsEnabled: db.ai_agent_reviews_enabled,
            mcpContentWritesEnabled: db.mcp_content_writes_enabled,
            requireExplicitSlackChannelLinking:
                db.require_explicit_slack_channel_linking,
            defaultAiAgentModelConfig: db.default_ai_agent_model_config,
            modelVisibility: db.model_visibility,
            providerApiKeysSet: {
                anthropic: Boolean(keys.anthropic),
                openai: Boolean(keys.openai),
            },
            providerApiKeyHints: db.provider_api_key_hints ?? {
                anthropic: null,
                openai: null,
            },
        };
    }

    async findByOrganizationUuid(
        organizationUuid: string,
    ): Promise<AiOrganizationSettings | null> {
        const row = await this.database
            .select<DbAiOrganizationSettings>()
            .from(AiOrganizationSettingsTableName)
            .where('organization_uuid', organizationUuid)
            .first();

        return row ? this.mapDbToEntity(row) : null;
    }

    async getByOrganizationUuid(
        organizationUuid: string,
    ): Promise<AiOrganizationSettings> {
        const settings = await this.findByOrganizationUuid(organizationUuid);
        if (!settings) {
            throw new NotFoundError(
                `AI organization settings not found for organization ${organizationUuid}`,
            );
        }
        return settings;
    }

    async findDecryptedProviderApiKeys(
        organizationUuid: string,
    ): Promise<AiOrgProviderApiKeys | null> {
        const row = await this.database(AiOrganizationSettingsTableName)
            .select('encrypted_provider_api_keys')
            .where('organization_uuid', organizationUuid)
            .first<
                | Pick<DbAiOrganizationSettings, 'encrypted_provider_api_keys'>
                | undefined
            >();

        if (!row?.encrypted_provider_api_keys) return null;
        const keys = this.decryptProviderApiKeys(
            row.encrypted_provider_api_keys,
        );
        return keys.anthropic || keys.openai ? keys : null;
    }

    async create(
        data: CreateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const keys = applyProviderApiKeyUpdates({}, data.providerApiKeys ?? {});

        const [row] = await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .insert({
                organization_uuid: data.organizationUuid,
                ai_agents_visible: data.aiAgentsVisible,
                ai_agent_reviews_enabled: data.aiAgentReviewsEnabled,
                mcp_content_writes_enabled: data.mcpContentWritesEnabled,
                require_explicit_slack_channel_linking:
                    data.requireExplicitSlackChannelLinking,
                default_ai_agent_model_config: data.defaultAiAgentModelConfig,
                model_visibility: data.modelVisibility,
                encrypted_provider_api_keys: this.encryptProviderApiKeys(keys),
                provider_api_key_hints: buildProviderApiKeyHints(keys),
            })
            .returning('*');

        return this.mapDbToEntity(row);
    }

    async update(
        organizationUuid: string,
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const updateData: Partial<
            Pick<
                DbAiOrganizationSettings,
                | 'ai_agents_visible'
                | 'ai_agent_reviews_enabled'
                | 'mcp_content_writes_enabled'
                | 'require_explicit_slack_channel_linking'
                | 'default_ai_agent_model_config'
                | 'model_visibility'
                | 'encrypted_provider_api_keys'
                | 'provider_api_key_hints'
            >
        > = {};
        if (data.aiAgentsVisible !== undefined) {
            updateData.ai_agents_visible = data.aiAgentsVisible;
        }
        if (data.aiAgentReviewsEnabled !== undefined) {
            updateData.ai_agent_reviews_enabled = data.aiAgentReviewsEnabled;
        }
        if (data.mcpContentWritesEnabled !== undefined) {
            updateData.mcp_content_writes_enabled =
                data.mcpContentWritesEnabled;
        }
        if (data.requireExplicitSlackChannelLinking !== undefined) {
            updateData.require_explicit_slack_channel_linking =
                data.requireExplicitSlackChannelLinking;
        }
        if (data.defaultAiAgentModelConfig !== undefined) {
            updateData.default_ai_agent_model_config =
                data.defaultAiAgentModelConfig;
        }
        if (data.modelVisibility !== undefined) {
            updateData.model_visibility = data.modelVisibility;
        }
        if (data.providerApiKeys !== undefined) {
            const providerApiKeyUpdates = data.providerApiKeys;
            return this.database.transaction(async (trx) => {
                const currentRow = await trx(AiOrganizationSettingsTableName)
                    .select('encrypted_provider_api_keys')
                    .where('organization_uuid', organizationUuid)
                    .forUpdate()
                    .first<
                        | Pick<
                              DbAiOrganizationSettings,
                              'encrypted_provider_api_keys'
                          >
                        | undefined
                    >();

                if (!currentRow) {
                    throw new NotFoundError(
                        `AI organization settings not found for organization ${organizationUuid}`,
                    );
                }

                const existingKeys = this.decryptProviderApiKeys(
                    currentRow.encrypted_provider_api_keys,
                );
                const mergedKeys = applyProviderApiKeyUpdates(
                    existingKeys,
                    providerApiKeyUpdates,
                );
                updateData.encrypted_provider_api_keys =
                    this.encryptProviderApiKeys(mergedKeys);
                updateData.provider_api_key_hints =
                    buildProviderApiKeyHints(mergedKeys);

                const [row] = await trx<AiOrganizationSettingsTable>(
                    AiOrganizationSettingsTableName,
                )
                    .where('organization_uuid', organizationUuid)
                    .update(updateData)
                    .returning('*');

                if (!row) {
                    throw new NotFoundError(
                        `AI organization settings not found for organization ${organizationUuid}`,
                    );
                }

                return this.mapDbToEntity(row);
            });
        }
        if (Object.keys(updateData).length === 0) {
            return this.getByOrganizationUuid(organizationUuid);
        }

        const [row] = await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .update(updateData)
            .returning('*');

        if (!row) {
            throw new NotFoundError(
                `AI organization settings not found for organization ${organizationUuid}`,
            );
        }

        return this.mapDbToEntity(row);
    }

    async upsert(
        organizationUuid: string,
        data: UpdateAiOrganizationSettings,
    ): Promise<AiOrganizationSettings> {
        const existing = await this.findByOrganizationUuid(organizationUuid);

        if (existing) {
            return this.update(organizationUuid, data);
        }
        return this.create({
            organizationUuid,
            aiAgentsVisible: data.aiAgentsVisible ?? true,
            aiAgentReviewsEnabled: data.aiAgentReviewsEnabled ?? false,
            mcpContentWritesEnabled: data.mcpContentWritesEnabled ?? true,
            requireExplicitSlackChannelLinking:
                data.requireExplicitSlackChannelLinking ?? false,
            defaultAiAgentModelConfig: data.defaultAiAgentModelConfig ?? null,
            modelVisibility: data.modelVisibility ?? null,
            providerApiKeys: data.providerApiKeys,
        });
    }

    async delete(organizationUuid: string): Promise<void> {
        await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .delete();
    }
}
