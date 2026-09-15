import { MODEL_PRESETS } from '../ai/models/presets';
import { pickAutopilotModel } from './modelSelection';

const [sonnet] = MODEL_PRESETS.anthropic;
const [gpt] = MODEL_PRESETS.openai;

describe('pickAutopilotModel', () => {
    it('prefers the org default when the org may still use it', () => {
        expect(
            pickAutopilotModel({
                orgDefault: { modelProvider: 'openai', modelName: gpt.name },
                instanceDefault: { provider: 'anthropic', name: sonnet.name },
                availableModels: [sonnet, gpt],
            }),
        ).toEqual({ provider: 'openai', modelName: gpt.name });
    });

    it('falls back to the instance default when the org default is hidden', () => {
        expect(
            pickAutopilotModel({
                orgDefault: { modelProvider: 'openai', modelName: gpt.name },
                instanceDefault: { provider: 'anthropic', name: sonnet.name },
                availableModels: [sonnet],
            }),
        ).toEqual({ provider: 'anthropic', modelName: sonnet.name });
    });

    it('uses the Azure deployment even though Azure has no preset catalog', () => {
        expect(
            pickAutopilotModel({
                orgDefault: null,
                instanceDefault: { provider: 'azure', name: 'my-deployment' },
                availableModels: [],
            }),
        ).toEqual({ provider: 'azure', modelName: 'my-deployment' });
    });

    it('takes any model of the default provider before other providers', () => {
        expect(
            pickAutopilotModel({
                orgDefault: null,
                instanceDefault: { provider: 'openai', name: 'retired-model' },
                availableModels: [sonnet, gpt],
            }),
        ).toEqual({ provider: 'openai', modelName: gpt.name });
    });

    it('returns null when nothing is available', () => {
        expect(
            pickAutopilotModel({
                orgDefault: { modelProvider: 'google', modelName: 'gemini' },
                instanceDefault: null,
                availableModels: [],
            }),
        ).toBeNull();
    });
});
