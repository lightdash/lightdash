import { createGoogleVertex } from '@ai-sdk/google-vertex';
import { assertUnreachable } from '@lightdash/common';
import { wrapLanguageModel } from 'ai';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

type VertexConfig = NonNullable<
    LightdashConfig['ai']['copilot']['providers']['vertex']
>;

const getVertexModel = ({ auth, modelName }: VertexConfig) => {
    // Use generateContent for both auth methods. Vertex Interactions support
    // differs from the Gemini Developer API: our September 2026 Gemini probes
    // failed, and the SDK rejects Interactions with Express Mode API keys.
    // Recheck model and auth support before switching to .interactions().
    switch (auth.type) {
        case 'api-key':
            return createGoogleVertex({ apiKey: auth.apiKey })(modelName);
        case 'adc':
            return createGoogleVertex({
                project: auth.project,
                location: auth.location,
            })(modelName);
        default:
            return assertUnreachable(
                auth,
                'Unknown Vertex authentication type',
            );
    }
};

export const getGoogleVertexModel = (
    config: VertexConfig,
): AiModel<'vertex'> => ({
    model: wrapLanguageModel({
        model: getVertexModel(config),
        // Keep usage attribution distinct from the Gemini Developer API.
        providerId: 'vertex',
        middleware: { specificationVersion: 'v4' },
    }),
    // Leave model-specific sampling and thinking settings to Google's defaults.
    callOptions: {},
    providerOptions: undefined,
});
