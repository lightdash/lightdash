import { FeatureFlags } from '@lightdash/common';
import {
    AiCopilotConfigSchemaType,
    anthropicProviderSchema,
    openaiProviderSchema,
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

    // Only the apiKey is org-supplied. When the instance already configures the
    // provider we inherit its options and override just the key; otherwise we
    // synthesise the provider from the zod schema defaults (single source of
    // truth) rather than hand-writing every option.
    if (orgKeys.anthropic) {
        providers.anthropic = providers.anthropic
            ? { ...providers.anthropic, apiKey: orgKeys.anthropic }
            : anthropicProviderSchema.parse({ apiKey: orgKeys.anthropic });
    }

    if (orgKeys.openai) {
        providers.openai = providers.openai
            ? { ...providers.openai, apiKey: orgKeys.openai }
            : openaiProviderSchema.parse({ apiKey: orgKeys.openai });
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
