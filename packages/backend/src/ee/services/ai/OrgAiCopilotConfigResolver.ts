import {
    BYO_AI_PROVIDERS,
    MissingConfigError,
    type AiOrgModelVisibility,
    type ByoAiProvider,
    type DataAppModelVisibility,
} from '@lightdash/common';
import { AiCopilotConfigSchemaType } from '../../../config/aiConfigSchema';
import { LightdashConfig } from '../../../config/parseConfig';
import { AiModelCatalog } from '../../clients/Ai/AiModelCatalog';
import {
    AiOrganizationSettingsModel,
    AiOrgProviderApiKeys,
} from '../../models/AiOrganizationSettingsModel';
import { getFastModelForAccessibleKey, OrgModelOverrides } from './models';
import { keyGrantsModel } from './models/presets';

export type CopilotConfig = AiCopilotConfigSchemaType;

/**
 * A copilot config resolved for a specific org, annotated with which providers
 * are served by the org's own self-managed (BYO) key. `byoProviders` is empty
 * for the instance (Lightdash-managed) config. The model builders read it to
 * stamp `keyManagement` onto usage analytics.
 */
export type ResolvedCopilotConfig = CopilotConfig & {
    byoProviders: ByoAiProvider[];
};

// Review turns run on a fast Anthropic model; a BYO Anthropic key must be able
// to serve it for reviews to run on the org's own key instead of being paused.
const REVIEW_JUDGE_ANTHROPIC_MODEL = 'claude-haiku-4-5';

export type ReviewJudgeAvailability = {
    hasActiveByoKey: boolean;
    canJudgeOnByoKey: boolean;
};

const hasAnthropicByoGatewayConflict = (
    config: CopilotConfig,
    orgKeys: AiOrgProviderApiKeys,
): boolean => Boolean(orgKeys.anthropic && config.providers.anthropic?.baseUrl);

const hasGoogleByoGatewayConflict = (
    config: CopilotConfig,
    orgKeys: AiOrgProviderApiKeys,
): boolean => Boolean(orgKeys.google && config.providers.google?.baseUrl);

/**
 * Overlay an org's own API key onto the instance copilot config. Only the
 * apiKey is org-supplied — every other provider option comes from the instance
 * config. Keys for providers the instance does not configure are ignored here
 * (the write path rejects them), so BYO can only swap the key of a provider
 * this instance already runs. Custom provider endpoints are the exception:
 * their instance credential may authenticate an arbitrary gateway, so an org
 * key is rejected rather than sent to that endpoint.
 */
/**
 * Effective model visibility = stored settings on top of an implicit default:
 * an org with any BYO key hides every BYO provider it has not keyed, so chat
 * never silently falls back to an instance key. Explicit stored settings win,
 * so an admin can re-enable a provider if they intentionally want fallback.
 */
export const resolveEffectiveModelVisibility = (
    orgKeys: AiOrgProviderApiKeys,
    stored: AiOrgModelVisibility | null,
): AiOrgModelVisibility | null => {
    const implicit: AiOrgModelVisibility = {};
    if (BYO_AI_PROVIDERS.some((provider) => orgKeys[provider])) {
        BYO_AI_PROVIDERS.forEach((provider) => {
            if (!orgKeys[provider]) {
                implicit[provider] = { enabled: false };
            }
        });
    }
    const merged = { ...implicit, ...(stored ?? {}) };
    return Object.keys(merged).length > 0 ? merged : null;
};

export const overlayOrgProviderApiKeys = (
    config: CopilotConfig,
    orgKeys: AiOrgProviderApiKeys,
): ResolvedCopilotConfig => {
    const providers = { ...config.providers };

    if (orgKeys.anthropic && providers.anthropic) {
        if (hasAnthropicByoGatewayConflict(config, orgKeys)) {
            throw new MissingConfigError(
                'Organization Anthropic API keys cannot be used while ANTHROPIC_BASE_URL is configured. Remove the organization key or disable the instance Anthropic gateway.',
            );
        }
        providers.anthropic = {
            ...providers.anthropic,
            apiKey: orgKeys.anthropic,
        };
    }

    if (orgKeys.google && providers.google) {
        if (hasGoogleByoGatewayConflict(config, orgKeys)) {
            throw new MissingConfigError(
                'Organization Google Gemini API keys cannot be used while GEMINI_BASE_URL is configured. Remove the organization key or disable the instance Gemini gateway.',
            );
        }
        providers.google = {
            ...providers.google,
            apiKey: orgKeys.google,
        };
    }

    if (orgKeys.openai && providers.openai) {
        providers.openai = {
            ...providers.openai,
            apiKey: orgKeys.openai,
        };
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

    return {
        ...config,
        providers,
        defaultProvider,
        byoProviders: usableByoProviders,
    };
};

type Dependencies = {
    lightdashConfig: LightdashConfig;
    aiOrganizationSettingsModel: AiOrganizationSettingsModel;
    aiModelCatalog: AiModelCatalog;
};

export class OrgAiCopilotConfigResolver {
    private lightdashConfig: LightdashConfig;

    private aiOrganizationSettingsModel: AiOrganizationSettingsModel;

    private aiModelCatalog: AiModelCatalog;

    constructor(dependencies: Dependencies) {
        this.lightdashConfig = dependencies.lightdashConfig;
        this.aiOrganizationSettingsModel =
            dependencies.aiOrganizationSettingsModel;
        this.aiModelCatalog = dependencies.aiModelCatalog;
    }

    async getCopilotConfig(
        organizationUuid: string | null | undefined,
    ): Promise<ResolvedCopilotConfig> {
        const base = this.lightdashConfig.ai.copilot;
        const managed: ResolvedCopilotConfig = { ...base, byoProviders: [] };
        if (!organizationUuid) return managed;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return managed;
        return overlayOrgProviderApiKeys(base, orgKeys);
    }

    /**
     * Copilot config for the data-apps sandbox (the `claude` CLI). Claude Code
     * supports only Anthropic and Bedrock, and Bedrock is instance infra (never
     * BYO) — so a BYO org must run the sandbox on its own Anthropic key. This
     * forces Anthropic and drops any instance Anthropic key the org didn't
     * bring, so the sandbox can never silently fall back to the instance key (a
     * billing + data-governance leak). With no usable org Anthropic key the
     * config carries none and key resolution fails only where a Claude turn
     * needs it — not for key-less sandbox work (dependency builds, restores).
     * Non-BYO orgs get the instance config unchanged.
     */
    async getClaudeCodeConfig(
        organizationUuid: string | null | undefined,
    ): Promise<ResolvedCopilotConfig> {
        const base = this.lightdashConfig.ai.copilot;
        const managed: ResolvedCopilotConfig = { ...base, byoProviders: [] };
        if (!organizationUuid) return managed;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return managed;
        const overlaid = overlayOrgProviderApiKeys(base, orgKeys);
        return {
            ...overlaid,
            defaultProvider: 'anthropic',
            providers: {
                ...overlaid.providers,
                anthropic: orgKeys.anthropic
                    ? overlaid.providers.anthropic
                    : undefined,
            },
        };
    }

    /**
     * Copilot config for a data-app sandbox running Codex. Mirrors the Claude
     * resolver's BYOK boundary: once an org supplies any provider key, Codex
     * may use only that org's OpenAI key and never the instance OpenAI key.
     */
    async getCodexConfig(
        organizationUuid: string | null | undefined,
    ): Promise<ResolvedCopilotConfig> {
        const base = this.lightdashConfig.ai.copilot;
        const managed: ResolvedCopilotConfig = { ...base, byoProviders: [] };
        if (!organizationUuid) return managed;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return managed;
        const overlaid = overlayOrgProviderApiKeys(base, orgKeys);
        return {
            ...overlaid,
            defaultProvider: 'openai',
            providers: {
                ...overlaid.providers,
                openai: orgKeys.openai ? overlaid.providers.openai : undefined,
            },
        };
    }

    /**
     * Org overrides for model LISTINGS (visibility settings + which hidden
     * models the org's own Anthropic key unlocks). Both are null unless the
     * org has at least one BYO key, so deleting the key leaves stored
     * visibility settings inert.
     */
    async getOrgModelOverrides(
        organizationUuid: string | null | undefined,
    ): Promise<OrgModelOverrides> {
        const none: OrgModelOverrides = {
            modelVisibility: null,
            keyAccessibleModelIds: null,
        };
        if (!organizationUuid) return none;
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
                  anthropic: hasAnthropicByoGatewayConflict(
                      this.lightdashConfig.ai.copilot,
                      orgKeys,
                  )
                      ? null
                      : await this.aiModelCatalog.getAccessibleModelIds(
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
     * Org-admin visibility settings for Data App Claude models (opus/sonnet/
     * haiku). Gated the same way as getOrgModelOverrides: null unless the org
     * brings its own Anthropic key, so removing the key
     * leaves stored settings inert rather than restricting models on the
     * instance's own key. Anthropic specifically — getClaudeCodeConfig only
     * swaps in an org key for Anthropic, since the Claude CLI speaks no other
     * BYO provider.
     */
    async getDataAppModelVisibility(
        organizationUuid: string | null | undefined,
    ): Promise<DataAppModelVisibility | null> {
        if (!organizationUuid) return null;
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys?.anthropic) return null;
        const settings =
            await this.aiOrganizationSettingsModel.findByOrganizationUuid(
                organizationUuid,
            );
        return settings?.dataAppModelVisibility ?? null;
    }

    /**
     * The model ids a provider API key can access (cached in the catalog).
     * Null on any failure so callers fail closed.
     */
    async getAccessibleModelIds(
        provider: ByoAiProvider,
        apiKey: string,
        options?: {
            baseUrl?: string;
            availableModels?: string[];
            customHeaders?: Record<string, string>;
        },
    ): Promise<string[] | null> {
        if (options?.baseUrl && options.availableModels?.length) {
            return options.availableModels;
        }
        return this.aiModelCatalog.getAccessibleModelIds(provider, apiKey, {
            baseUrl: options?.baseUrl,
            headers: options?.customHeaders,
        });
    }

    /**
     * A fast/lightweight-task model for the given (already overlaid) config,
     * BYO-key-aware: on a BYO Anthropic key it picks a fast model the key can
     * actually serve (falling back to an accessible preset like opus 4.8 rather
     * than erroring on haiku). Auxiliary AI (titles, suggestions, compaction)
     * uses this so it runs on the org's own key without the fast model breaking.
     */
    async resolveFastModel(
        config: ResolvedCopilotConfig,
        options?: { enableReasoning?: boolean },
    ) {
        const { anthropic } = config.providers;
        const anthropicAllowed =
            config.byoProviders.length === 0 ||
            config.byoProviders.includes('anthropic');
        const accessibleModelIds =
            anthropic?.apiKey && anthropicAllowed
                ? await this.getAccessibleModelIds(
                      'anthropic',
                      anthropic.apiKey,
                      {
                          baseUrl: anthropic.baseUrl,
                          availableModels: anthropic.availableModels,
                          customHeaders: anthropic.customHeaders,
                      },
                  )
                : null;
        return getFastModelForAccessibleKey(
            config,
            accessibleModelIds,
            options,
        );
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
        const orgKeys =
            await this.aiOrganizationSettingsModel.findDecryptedProviderApiKeys(
                organizationUuid,
            );
        if (!orgKeys) return none;
        const hasActiveByoKey = BYO_AI_PROVIDERS.some(
            (provider) => orgKeys[provider],
        );
        if (!orgKeys.anthropic) {
            return { hasActiveByoKey, canJudgeOnByoKey: false };
        }
        if (
            hasAnthropicByoGatewayConflict(
                this.lightdashConfig.ai.copilot,
                orgKeys,
            )
        ) {
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
