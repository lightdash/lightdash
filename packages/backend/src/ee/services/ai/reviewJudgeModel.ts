import { type LightdashConfig } from '../../../config/parseConfig';
import { getModel } from './models';
import { type OrgAiCopilotConfigResolver } from './OrgAiCopilotConfigResolver';

export type ReviewJudgeConfigResolver = Pick<
    OrgAiCopilotConfigResolver,
    'getCopilotConfig' | 'getReviewJudgeAvailability'
>;

/** Prefer Anthropic for review, otherwise use the configured default. */
export const resolveReviewJudgeProvider = (
    copilot: LightdashConfig['ai']['copilot'],
): LightdashConfig['ai']['copilot']['defaultProvider'] | undefined =>
    copilot.providers.anthropic ? 'anthropic' : undefined;

export const resolveReviewJudgeModel = async ({
    organizationUuid,
    credentialUuid,
    orgAiCopilotConfigResolver,
    instanceCopilotConfig,
}: {
    organizationUuid: string;
    /**
     * The judged agent's credential pin. Required so every judge path states
     * it: judges read the agent's responses, so a pinned agent must judge on
     * its own credential — the org-level availability check below would
     * otherwise route a pinned agent's content to the org default or the
     * instance provider.
     */
    credentialUuid: string | null;
    orgAiCopilotConfigResolver: ReviewJudgeConfigResolver;
    instanceCopilotConfig: LightdashConfig['ai']['copilot'];
}) => {
    if (credentialUuid) {
        // Pins are Bedrock-only, so the pinned credential's overlay replaces
        // the provider set with Bedrock alone; a judge model the credential
        // cannot serve fails closed rather than falling back out of region.
        const copilotConfig = await orgAiCopilotConfigResolver.getCopilotConfig(
            {
                organizationUuid,
                projectUuid: null,
                credentialUuid,
            },
        );
        const model = getModel(copilotConfig, {
            provider: copilotConfig.defaultProvider,
            useFastModel: true,
        });
        return { copilotConfig, model };
    }

    const { canJudgeOnByoKey, byoJudgeProvider } =
        await orgAiCopilotConfigResolver.getReviewJudgeAvailability(
            organizationUuid,
        );
    const copilotConfig = canJudgeOnByoKey
        ? await orgAiCopilotConfigResolver.getCopilotConfig({
              organizationUuid,
              projectUuid: null,
              credentialUuid: null,
          })
        : instanceCopilotConfig;
    const model = getModel(copilotConfig, {
        provider: byoJudgeProvider ?? resolveReviewJudgeProvider(copilotConfig),
        useFastModel: true,
    });

    return { copilotConfig, model };
};
