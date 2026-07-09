import {
    BYO_AI_PROVIDERS,
    FeatureFlags,
    type AiOrgModelVisibility,
    type ByoAiProvider,
} from '@lightdash/common';
import { AiCopilotConfigSchemaType } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { FeatureFlagService } from '../../../services/FeatureFlag/FeatureFlagService';
import { AiModelCatalog } from '../../clients/Ai/AiModelCatalog';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';
import { OrgModelOverrides } from './models';
import { keyGrantsModel } from './models/presets';

export type CopilotConfig = AiCopilotConfigSchemaType;

// Review turns run on a fast Anthropic model; a BYO Anthropic key must be able
// to serve it for reviews to run on the org's own key instead of being paused.
const REVIEW_JUDGE_ANTHROPIC_MODEL = 'claude-haiku-4-5';

export type ReviewJudgeAvailability = {
    hasActiveByoKey: boolean;
    canJudgeOnByoKey: boolean;
};

/**
 * Overlay an org's own API key onto the instance copilot config. Only the
 * apiKey is org-supplied — every other provider option comes from the instance
 * config. Keys for providers the instance does not configure are ignored here
 * (the write path rejects them), so BYO can only swap the key of a provider
 * this instance already runs.
 */
/**
 * Effective model visibility = stored settings on top of an implicit default:
 * an org with a BYO Anthropic key but no BYO OpenAI key hides OpenAI from the
 * model selector, so chat never silently falls back to the instance OpenAI key.
 * Explicit stored settings win, so an admin can re-enable OpenAI if they want
 * the fallback.
 */
export const resolveEffectiveModelVisibility = (
    orgKeys: AiOrgProviderApiKeys,
    stored: AiOrgModelVisibility | null,
): AiOrgModelVisibility | null => {
    const implicit: AiOrgModelVisibility = {};
    if (orgKeys.anthropic && !orgKeys.openai) {
        implicit.openai = { enabled: false };
    }
    const merged = { ...implicit, ...(stored ?? {}) };
    return Object.keys(merged).length > 0 ? merged : null;
};

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

    // When the org brings its own key(s), never resolve to a provider it did
    // not supply — that would silently use the instance key (a billing +
    // data-governance leak for a BYO org). If the instance default provider
    // isn't one the org keyed, switch the default to a provider the org's own
    // key serves, so auxiliary AI (titles, suggestions, routing, compaction)
    // runs on the org's key instead of falling back to the instance provider.
    const usableByoProviders = BYO_AI_PROVIDERS.filter(
        (provider) => orgKeys[provider] && providers[provider],
    );
    const defaultProvider =
        usableByoProviders.length > 0 &&
        !usableByoProviders.some(
            (provider) => provider === config.defaultProvider,
        )
            ? usableByoProviders[0]
            : config.defaultProvider;

    return { ...config, providers, defaultProvider };
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
            modelVisibility: resolveEffectiveModelVisibility(
                orgKeys,
                settings?.modelVisibility ?? null,
            ),
            keyAccessibleModelIds,
        };
    }

    /**
     * Effective model visibility for a *submitted* payload — merges the implicit
     * auto-hide (Anthropic-only key ⇒ OpenAI hidden) under the submission, the
     * same way getOrgModelOverrides does for stored settings. Used to validate a
     * save against what the selector will actually show, so an admin can't hide
     * every model by disabling the one provider whose toggle isn't locked.
     */
    async resolveEffectiveModelVisibilityForOrg(
        organizationUuid: string,
        submitted: AiOrgModelVisibility | null,
    ): Promise<AiOrgModelVisibility | null> {
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return submitted;
        return resolveEffectiveModelVisibility(orgKeys, submitted);
    }

    /**
     * The model ids a provider API key can access (cached in the catalog).
     * Null on any failure so callers fail closed.
     */
    async getAccessibleModelIds(
        provider: ByoAiProvider,
        apiKey: string,
    ): Promise<string[] | null> {
        return this.aiModelCatalog.getAccessibleModelIds(provider, apiKey);
    }

    /**
     * Whether review turns may run for an org while honoring BYO isolation.
     * Reviews run on a fast Anthropic model, so an org with its own key can only
     * run them if that key can serve it — never by falling back to the instance
     * provider.
     */
    async getReviewJudgeAvailability(
        organizationUuid: string | null | undefined,
    ): Promise<ReviewJudgeAvailability> {
        const none: ReviewJudgeAvailability = {
            hasActiveByoKey: false,
            canJudgeOnByoKey: false,
        };
        if (!organizationUuid) return none;
        if (!(await this.isEnabled(organizationUuid))) return none;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return none;
        const hasActiveByoKey = Boolean(orgKeys.anthropic || orgKeys.openai);
        if (!orgKeys.anthropic) {
            return { hasActiveByoKey, canJudgeOnByoKey: false };
        }
        const modelIds = await this.aiModelCatalog.getAccessibleModelIds(
            'anthropic',
            orgKeys.anthropic,
        );
        const canJudgeOnByoKey = modelIds
            ? keyGrantsModel(modelIds, REVIEW_JUDGE_ANTHROPIC_MODEL)
            : false;
        return { hasActiveByoKey, canJudgeOnByoKey };
    }
}
