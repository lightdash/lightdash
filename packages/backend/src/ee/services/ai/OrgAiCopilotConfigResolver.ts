import { FeatureFlags } from '@lightdash/common';
import {
    AiCopilotConfigSchemaType,
    DEFAULT_ANTHROPIC_MODEL_NAME,
    DEFAULT_OPENAI_EMBEDDING_MODEL,
    DEFAULT_OPENAI_MODEL_NAME,
} from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';

export type CopilotConfig = AiCopilotConfigSchemaType;

export const overlayOrgProviderApiKeys = (
    config: CopilotConfig,
    orgKeys: AiOrgProviderApiKeys,
): CopilotConfig => {
    const providers = { ...config.providers };

    if (orgKeys.anthropic) {
        providers.anthropic = providers.anthropic
            ? { ...providers.anthropic, apiKey: orgKeys.anthropic }
            : {
                  apiKey: orgKeys.anthropic,
                  modelName: DEFAULT_ANTHROPIC_MODEL_NAME,
                  availableModels: undefined,
                  customHeaders: {},
                  supportsStreaming: true,
              };
    }

    if (orgKeys.openai) {
        providers.openai = providers.openai
            ? { ...providers.openai, apiKey: orgKeys.openai }
            : {
                  apiKey: orgKeys.openai,
                  modelName: DEFAULT_OPENAI_MODEL_NAME,
                  embeddingModelName: DEFAULT_OPENAI_EMBEDDING_MODEL,
                  baseUrl: undefined,
                  availableModels: undefined,
                  zeroDataRetention: false,
                  customHeaders: {},
                  supportsStreaming: true,
              };
    }

    const defaultProvider = providers[config.defaultProvider]
        ? config.defaultProvider
        : ((['anthropic', 'openai'] as const).find(
              (provider) => providers[provider] !== undefined,
          ) ?? config.defaultProvider);

    return { ...config, providers, defaultProvider };
};

type Dependencies = {
    lightdashConfig: LightdashConfig;
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    featureFlagService: FeatureFlagService;
};

export class OrgAiCopilotConfigResolver {
    private lightdashConfig: LightdashConfig;

    private aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private featureFlagService: FeatureFlagService;

    constructor(dependencies: Dependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.featureFlagService = dependencies.featureFlagService;
    }

    async isEnabled(organizationUuid: string): Promise<boolean> {
        // Non-UUID userUuid is tolerated by FeatureFlagModel (embed-account guard)
        const flag = await this.featureFlagService.get({
            user: {
                userUuid: 'org-ai-copilot-config-resolver',
                organizationUuid,
            },
            featureFlagId: FeatureFlags.OrgAiProviderApiKeys,
        });
        return flag.enabled;
    }

    async getCopilotConfig(
        organizationUuid: string | null | undefined,
    ): Promise<CopilotConfig> {
        const base = this.lightdashConfig.ai.copilot;
        if (!organizationUuid) return base;
        if (!(await this.isEnabled(organizationUuid))) return base;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return base;
        return overlayOrgProviderApiKeys(base, orgKeys);
    }
}
