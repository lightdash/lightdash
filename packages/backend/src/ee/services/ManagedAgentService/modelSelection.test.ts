import { MODEL_PRESETS, vertexPreset } from '../ai/models/presets';
import { pickAutopilotModel } from './modelSelection';

const sonnet = MODEL_PRESETS.anthropic.find(
    (model) => model.name === 'claude-sonnet-5',
)!;
const [gpt] = MODEL_PRESETS.openai;
const opus47 = MODEL_PRESETS.anthropic.find(
    (model) => model.name === 'claude-opus-4-7',
)!;
const opus48 = MODEL_PRESETS.anthropic.find(
    (model) => model.name === 'claude-opus-4-8',
)!;
const opus55 = MODEL_PRESETS.anthropic.find(
    (model) => model.name === 'claude-opus-5-5',
)!;
const bedrockOpus47 = MODEL_PRESETS.bedrock.find(
    (model) => model.name === 'claude-opus-4-7',
)!;
const bedrockSonnet = MODEL_PRESETS.bedrock.find(
    (model) => model.name === 'claude-sonnet-5',
)!;

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

    it('uses the selectable Vertex instance model when it is the default', () => {
        expect(
            pickAutopilotModel({
                orgDefault: null,
                instanceDefault: {
                    provider: 'vertex',
                    name: 'gemini-3.8-flash',
                },
                availableModels: [vertexPreset('gemini-3.8-flash')],
            }),
        ).toEqual({ provider: 'vertex', modelName: 'gemini-3.8-flash' });
    });

    it('prefers Opus 4.7 over the chat default on Anthropic when the org may use it', () => {
        expect(
            pickAutopilotModel({
                orgDefault: {
                    modelProvider: 'anthropic',
                    modelName: sonnet.name,
                },
                instanceDefault: { provider: 'anthropic', name: sonnet.name },
                availableModels: [sonnet, opus47, gpt],
            }),
        ).toEqual({ provider: 'anthropic', modelName: 'claude-opus-4-7' });
    });

    it.each([
        ['anthropic', 'claude-sonnet-5'],
        ['anthropic', 'claude-opus-5'],
        ['bedrock', 'claude-sonnet-5'],
        ['bedrock', 'claude-opus-5'],
    ] as const)(
        'prefers Opus 5.5 over %s %s when the org may use it',
        (provider, modelName) => {
            expect(
                pickAutopilotModel({
                    orgDefault: { modelProvider: provider, modelName },
                    instanceDefault: { provider, name: modelName },
                    availableModels: MODEL_PRESETS[provider],
                }),
            ).toEqual({ provider, modelName: 'claude-opus-5-5' });
        },
    );

    it('keeps an Opus the organisation chose instead of moving it to a newer one', () => {
        expect(
            pickAutopilotModel({
                orgDefault: {
                    modelProvider: 'anthropic',
                    modelName: opus48.name,
                },
                instanceDefault: { provider: 'anthropic', name: sonnet.name },
                availableModels: [sonnet, opus47, opus48, opus55],
            }),
        ).toEqual({ provider: 'anthropic', modelName: 'claude-opus-4-8' });
    });

    it('prefers Opus 4.7 on Bedrock too', () => {
        expect(
            pickAutopilotModel({
                orgDefault: null,
                instanceDefault: {
                    provider: 'bedrock',
                    name: 'claude-sonnet-5',
                },
                availableModels: [bedrockSonnet, bedrockOpus47],
            }),
        ).toEqual({ provider: 'bedrock', modelName: 'claude-opus-4-7' });
    });

    it('keeps the chat default when Opus 4.7 is hidden for the org', () => {
        expect(
            pickAutopilotModel({
                orgDefault: {
                    modelProvider: 'anthropic',
                    modelName: sonnet.name,
                },
                instanceDefault: { provider: 'anthropic', name: sonnet.name },
                availableModels: [sonnet, gpt],
            }),
        ).toEqual({ provider: 'anthropic', modelName: sonnet.name });
    });

    it('does not move an OpenAI organisation to Anthropic', () => {
        expect(
            pickAutopilotModel({
                orgDefault: { modelProvider: 'openai', modelName: gpt.name },
                instanceDefault: { provider: 'anthropic', name: sonnet.name },
                availableModels: [sonnet, opus47, gpt],
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
