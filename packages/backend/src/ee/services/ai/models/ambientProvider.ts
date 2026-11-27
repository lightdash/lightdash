import { type CopilotConfigForModel } from '.';

/**
 * Ambient calls run on the org's Anthropic key when it has one, else on the
 * instance default provider. Kept out of the index so tests that mock the
 * model builders still get the real selection.
 */
export const pickAmbientProvider = (
    config: CopilotConfigForModel,
): CopilotConfigForModel['defaultProvider'] =>
    config.providers.anthropic?.apiKey ? 'anthropic' : config.defaultProvider;
