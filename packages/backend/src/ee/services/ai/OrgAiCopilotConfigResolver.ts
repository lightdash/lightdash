import { FeatureFlags } from '@lightdash/common';
import { AiCopilotConfigSchemaType } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { AiModelCatalog } from '../../clients/Ai/AiModelCatalog';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';
import { OrgModelOverrides } from './models';

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
    aiModelCatalog: AiModelCatalog;
};

export class OrgAiCopilotConfigResolver {
    private lightdashConfig: LightdashConfig;

    private aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private featureFlagService: FeatureFlagService;

    private aiModelCatalog: AiModelCatalog;

    constructor(dependencies: Dependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.featureFlagService = dependencies.featureFlagService;
        this.aiModelCatalog = dependencies.aiModelCatalog;
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

    /**
     * Org overrides for model LISTINGS (visibility settings + which hidden
     * models the org's own Anthropic key unlocks). Both are null unless the
     * feature flag is on AND the org has at least one BYO key, so deleting
     * the key leaves stored visibility settings inert.
     */
    async getOrgModelOverrides(
        organizationUuid: string | null | undefined,
    ): Promise<OrgModelOverrides> {
        const none: OrgModelOverrides = {
            modelVisibility: null,
            keyAccessibleModelIds: null,
        };
        if (!organizationUuid) return none;
        if (!(await this.isEnabled(organizationUuid))) return none;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return none;
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        const keyAccessibleModelIds = orgKeys.anthropic
            ? {
                  anthropic: await this.aiModelCatalog.getAccessibleModelIds(
                      'anthropic',
                      orgKeys.anthropic,
                  ),
              }
            : null;
        return {
            modelVisibility: settings?.modelVisibility ?? null,
            keyAccessibleModelIds,
        };
    }
}
