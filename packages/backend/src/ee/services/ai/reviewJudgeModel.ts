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
    orgAiCopilotConfigResolver,
    instanceCopilotConfig,
}: {
    organizationUuid: string;
    orgAiCopilotConfigResolver: ReviewJudgeConfigResolver;
    instanceCopilotConfig: LightdashConfig['ai']['copilot'];
}) => {
    const { canJudgeOnByoKey } =
        await orgAiCopilotConfigResolver.getReviewJudgeAvailability(
            organizationUuid,
        );
    const copilotConfig = canJudgeOnByoKey
        ? await orgAiCopilotConfigResolver.getCopilotConfig(organizationUuid)
        : instanceCopilotConfig;
    const model = getModel(copilotConfig, {
        provider: canJudgeOnByoKey
            ? 'anthropic'
            : resolveReviewJudgeProvider(copilotConfig),
        useFastModel: true,
    });

    return { copilotConfig, model };
};
