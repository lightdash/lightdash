import {
    AI_DEEP_RESEARCH_DEFAULT_LIMITS,
    AiOrganizationSettings,
    AiProviderApiKeyHints,
    AiProviderApiKeysSet,
    BYO_AI_PROVIDERS,
    CreateAiOrganizationSettings,
    NotFoundError,
    ParameterError,
    UpdateAiOrganizationSettings,
    UpdateAiProviderApiKeys,
    type ByoAiProvider,
} from '@lightdash/common';
import { Knex } from 'knex';
import { z } from 'zod';
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

export type StoredAiOrganizationSettings = Omit<
    AiOrganizationSettings,
    'aiAgentMemoryEnabled'
>;

const storedAiOrgProviderApiKeyFields = {
    anthropic: z.string().optional(),
    google: z.string().optional(),
    openai: z.string().optional(),
} satisfies Record<ByoAiProvider, z.ZodOptional<z.ZodString>>;

// Keep known provider keys strongly typed and exhaustive, but strip unknown
// future-provider keys so mixed-version deploys do not invalidate the whole blob.
const storedAiOrgProviderApiKeysSchema = z
    .object(storedAiOrgProviderApiKeyFields)
    .strip();

export type AiOrgProviderApiKeys = z.infer<
    typeof storedAiOrgProviderApiKeysSchema
>;

export const parseAiOrgProviderApiKeys = (
    value: unknown,
): AiOrgProviderApiKeys | null => {
    const result = storedAiOrgProviderApiKeysSchema.safeParse(value);
    if (!result.success) return null;

    return result.data;
};

const emptyProviderApiKeyHints = (): AiProviderApiKeyHints => ({
    anthropic: null,
    google: null,
    openai: null,
});

const emptyProviderApiKeysSet = (): AiProviderApiKeysSet => ({
    anthropic: false,
    google: false,
    openai: false,
});

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
    if (!BYO_AI_PROVIDERS.some((provider) => keys[provider])) return null;
    const hints = emptyProviderApiKeyHints();
    BYO_AI_PROVIDERS.forEach((provider) => {
        const key = keys[provider];
        hints[provider] = key ? buildProviderApiKeyHint(key) : null;
    });
    return hints;
};

export const normalizeProviderApiKeyHints = (
    hints: Partial<AiProviderApiKeyHints> | null,
): AiProviderApiKeyHints => {
    const normalized = emptyProviderApiKeyHints();
    BYO_AI_PROVIDERS.forEach((provider) => {
        const hint = hints?.[provider];
        normalized[provider] = typeof hint === 'string' ? hint : null;
    });
    return normalized;
};

export const buildProviderApiKeysSet = (
    keys: AiOrgProviderApiKeys,
): AiProviderApiKeysSet => {
    const keysSet = emptyProviderApiKeysSet();
    BYO_AI_PROVIDERS.forEach((provider) => {
        keysSet[provider] = Boolean(keys[provider]);
    });
    return keysSet;
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
            const keys = parseAiOrgProviderApiKeys(
                JSON.parse(this.encryptionUtil.decrypt(encrypted)),
            );
            if (!keys) throw new Error('Invalid provider key data');
            return keys;
        } catch {
            Logger.warn(
                'Failed to decrypt AI provider API keys; treating as unset',
            );
            return {};
        }
    }

    private encryptProviderApiKeys(keys: AiOrgProviderApiKeys): Buffer | null {
        if (!BYO_AI_PROVIDERS.some((provider) => keys[provider])) return null;
        return this.encryptionUtil.encrypt(JSON.stringify(keys));
    }

    private mapDbToEntity(
        db: DbAiOrganizationSettings,
    ): StoredAiOrganizationSettings {
        const keys = this.decryptProviderApiKeys(
            db.encrypted_provider_api_keys,
        );
        return {
            organizationUuid: db.organization_uuid,
            aiAgentsVisible: db.ai_agents_visible,
            aiAgentReviewsEnabled: db.ai_agent_reviews_enabled,
            deepResearchLimits: db.deep_research_limits,
            deepResearchRawSqlEnabled: db.deep_research_raw_sql_enabled,
            mcpContentWritesEnabled: db.mcp_content_writes_enabled,
            mcpAgentsEnabled: db.mcp_agents_enabled,
            requireExplicitSlackChannelLinking:
                db.require_explicit_slack_channel_linking,
            defaultAiAgentModelConfig: db.default_ai_agent_model_config,
            modelVisibility: db.model_visibility,
            dataAppModelVisibility: db.data_app_model_visibility,
            providerApiKeysSet: buildProviderApiKeysSet(keys),
            providerApiKeyHints: normalizeProviderApiKeyHints(
                db.provider_api_key_hints,
            ),
            threadRetentionHours: db.thread_retention_hours,
        };
    }

    async findByOrganizationUuid(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<StoredAiOrganizationSettings | null> {
        const row = await database
            .select<DbAiOrganizationSettings>()
            .from(AiOrganizationSettingsTableName)
            .where('organization_uuid', organizationUuid)
            .first();

        return row ? this.mapDbToEntity(row) : null;
    }

    async getByOrganizationUuid(
        organizationUuid: string,
        database: Knex = this.database,
    ): Promise<StoredAiOrganizationSettings> {
        const settings = await this.findByOrganizationUuid(
            organizationUuid,
            database,
        );
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
        return BYO_AI_PROVIDERS.some((provider) => keys[provider])
            ? keys
            : null;
    }

    async create(
        data: CreateAiOrganizationSettings,
        database: Knex = this.database,
    ): Promise<StoredAiOrganizationSettings> {
        const keys = applyProviderApiKeyUpdates({}, data.providerApiKeys ?? {});

        const [row] = await database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .insert({
                organization_uuid: data.organizationUuid,
                ai_agents_visible: data.aiAgentsVisible,
                ai_agent_reviews_enabled: data.aiAgentReviewsEnabled,
                deep_research_limits: data.deepResearchLimits,
                deep_research_raw_sql_enabled: data.deepResearchRawSqlEnabled,
                mcp_content_writes_enabled: data.mcpContentWritesEnabled,
                mcp_agents_enabled: data.mcpAgentsEnabled,
                require_explicit_slack_channel_linking:
                    data.requireExplicitSlackChannelLinking,
                default_ai_agent_model_config: data.defaultAiAgentModelConfig,
                model_visibility: data.modelVisibility,
                data_app_model_visibility: data.dataAppModelVisibility,
                encrypted_provider_api_keys: this.encryptProviderApiKeys(keys),
                provider_api_key_hints: buildProviderApiKeyHints(keys),
                thread_retention_hours: data.threadRetentionHours ?? null,
            })
            .returning('*');

        return this.mapDbToEntity(row);
    }

    async update(
        organizationUuid: string,
        data: UpdateAiOrganizationSettings,
        database: Knex = this.database,
    ): Promise<StoredAiOrganizationSettings> {
        const updateData: Partial<
            Pick<
                DbAiOrganizationSettings,
                | 'ai_agents_visible'
                | 'ai_agent_reviews_enabled'
                | 'deep_research_limits'
                | 'deep_research_raw_sql_enabled'
                | 'mcp_content_writes_enabled'
                | 'mcp_agents_enabled'
                | 'require_explicit_slack_channel_linking'
                | 'default_ai_agent_model_config'
                | 'model_visibility'
                | 'data_app_model_visibility'
                | 'encrypted_provider_api_keys'
                | 'provider_api_key_hints'
                | 'thread_retention_hours'
            >
        > = {};
        if (data.aiAgentsVisible !== undefined) {
            updateData.ai_agents_visible = data.aiAgentsVisible;
        }
        if (data.aiAgentReviewsEnabled !== undefined) {
            updateData.ai_agent_reviews_enabled = data.aiAgentReviewsEnabled;
        }
        if (data.deepResearchLimits !== undefined) {
            updateData.deep_research_limits = data.deepResearchLimits;
        }
        if (data.deepResearchRawSqlEnabled !== undefined) {
            updateData.deep_research_raw_sql_enabled =
                data.deepResearchRawSqlEnabled;
        }
        if (data.mcpContentWritesEnabled !== undefined) {
            updateData.mcp_content_writes_enabled =
                data.mcpContentWritesEnabled;
        }
        if (data.mcpAgentsEnabled !== undefined) {
            updateData.mcp_agents_enabled = data.mcpAgentsEnabled;
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
        if (data.dataAppModelVisibility !== undefined) {
            updateData.data_app_model_visibility = data.dataAppModelVisibility;
        }
        if (data.threadRetentionHours !== undefined) {
            updateData.thread_retention_hours = data.threadRetentionHours;
        }
        if (data.providerApiKeys !== undefined) {
            const providerApiKeyUpdates = data.providerApiKeys;
            return database.transaction(async (trx) => {
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
            return this.getByOrganizationUuid(organizationUuid, database);
        }

        const [row] = await database<AiOrganizationSettingsTable>(
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
        database: Knex = this.database,
    ): Promise<StoredAiOrganizationSettings> {
        const existing = await this.findByOrganizationUuid(
            organizationUuid,
            database,
        );

        if (existing) {
            return this.update(organizationUuid, data, database);
        }
        return this.create(
            {
                organizationUuid,
                aiAgentsVisible: data.aiAgentsVisible ?? true,
                aiAgentReviewsEnabled: data.aiAgentReviewsEnabled ?? false,
                deepResearchLimits:
                    data.deepResearchLimits ?? AI_DEEP_RESEARCH_DEFAULT_LIMITS,
                deepResearchRawSqlEnabled:
                    data.deepResearchRawSqlEnabled ?? false,
                mcpContentWritesEnabled: data.mcpContentWritesEnabled ?? true,
                mcpAgentsEnabled: data.mcpAgentsEnabled ?? true,
                requireExplicitSlackChannelLinking:
                    data.requireExplicitSlackChannelLinking ?? false,
                defaultAiAgentModelConfig:
                    data.defaultAiAgentModelConfig ?? null,
                modelVisibility: data.modelVisibility ?? null,
                dataAppModelVisibility: data.dataAppModelVisibility ?? null,
                providerApiKeys: data.providerApiKeys,
                threadRetentionHours: data.threadRetentionHours ?? null,
            },
            database,
        );
    }

    async transaction<T>(
        callback: (trx: Knex.Transaction) => Promise<T>,
    ): Promise<T> {
        return this.database.transaction(callback);
    }

    async delete(organizationUuid: string): Promise<void> {
        await this.database<AiOrganizationSettingsTable>(
            AiOrganizationSettingsTableName,
        )
            .where('organization_uuid', organizationUuid)
            .delete();
    }
}
