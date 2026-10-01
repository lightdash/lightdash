import { generateText } from 'ai';
import { getAnthropicModel } from './anthropic-claude';
import { MODEL_PRESETS } from './presets';

describe('Anthropic document-write requests', () => {
    test.each([
        ['claude-opus-5-5', false],
        ['claude-sonnet-5-5', false],
        ['claude-opus-5', true],
        ['claude-sonnet-5', true],
        ['claude-haiku-4-5', true],
    ])(
        'uses supported thinking settings for %s',
        async (modelName, canDisable) => {
            const preset = MODEL_PRESETS.anthropic.find(
                (candidate) => candidate.name === modelName,
            );
            if (!preset) throw new Error(`Missing preset: ${modelName}`);

            let requestBody: unknown;
            const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
                requestBody = await new Response(init?.body).json();
                return Response.json({
                    id: 'synthetic-message',
                    type: 'message',
                    role: 'assistant',
                    model: preset.modelId,
                    content: [{ type: 'text', text: 'Summary' }],
                    stop_reason: 'end_turn',
                    stop_sequence: null,
                    usage: { input_tokens: 10, output_tokens: 1 },
                });
            });
            vi.stubGlobal('fetch', fetchMock);

            const config = {
                apiKey: 'synthetic-key',
                modelName,
                availableModels: [],
                customHeaders: {},
                supportsStreaming: true,
            };
            const mainModel = getAnthropicModel(config, preset, {
                enableReasoning: true,
            });
            const documentModel = getAnthropicModel(config, preset, {
                enableReasoning: false,
                disableThinking: true,
            });

            await generateText({
                model: mainModel.model,
                ...mainModel.callOptions,
                providerOptions: mainModel.providerOptions,
                prompt: 'Write a brief summary.',
                prepareStep: () => ({
                    model: documentModel.model,
                    providerOptions: documentModel.providerOptions,
                }),
            });

            expect(fetchMock).toHaveBeenCalledOnce();
            expect(requestBody).toMatchObject({
                model: preset.modelId,
                thinking: { type: canDisable ? 'disabled' : 'adaptive' },
                ...(!canDisable && { output_config: { effort: 'low' } }),
            });
        },
    );
});
