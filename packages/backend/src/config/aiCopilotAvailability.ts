import { type AiCopilotConfigSchemaType } from './aiConfigSchema';

export type AiCopilotAvailabilityConfig = Pick<
    AiCopilotConfigSchemaType,
    'enabled' | 'defaultProvider' | 'providers'
>;

/**
 * A model is configured when the config's default provider has credentials.
 * Pass the organization-resolved config: org keys are overlaid onto it and may
 * switch the default provider (a BYO Bedrock key needs no instance provider).
 */
export const hasConfiguredAiModel = (
    config: Pick<AiCopilotConfigSchemaType, 'defaultProvider' | 'providers'>,
): boolean => config.providers[config.defaultProvider] !== undefined;

/**
 * The single rule for whether AI copilot is available: a valid Enterprise
 * licence, AI enabled on the instance (`AI_COPILOT_ENABLED`) and a configured
 * model.
 */
export const isAiCopilotAvailable = ({
    licenseValid,
    config,
}: {
    licenseValid: boolean;
    config: AiCopilotAvailabilityConfig;
}): boolean => licenseValid && config.enabled && hasConfiguredAiModel(config);
