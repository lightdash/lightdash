import { FeatureFlags } from '@lightdash/common';
import { AiCopilotConfigSchemaType } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';

export type CopilotConfig = AiCopilotConfigSchemaType;

/**
 * Overlay an org's own API key onto the instance copilot config. Only the
 * apiKey is org-supplied — every other provider option comes from the instance
 * config. Keys for providers the instance does not configure are ignored here
 * (the write path rejects them), so BYO can only swap the key of a provider
 * this instance already runs.
 */
export const overlayOrgProviderApiKeys = (
    config: CopilotConfig,
    orgKeys: AiOrgProviderApiKeys,
): CopilotConfig => {
    const providers = { ...config.providers };

    if (orgKeys.anthropic && providers.anthropic) {
        providers.anthropic = {
            ...providers.anthropic,
            apiKey: orgKeys.anthropic,
        };
    }

    if (orgKeys.openai && providers.openai) {
        providers.openai = { ...providers.openai, apiKey: orgKeys.openai };
    }

    return { ...config, providers };
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
        // Org-scoped check with no acting user: use the 'system' placeholder
        // like other AI flag checks; a non-uuid userUuid skips the per-user
        // lookup and the flag resolves via the org override.
        const flag = await this.featureFlagService.get({
            user: { userUuid: 'system', organizationUuid },
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
