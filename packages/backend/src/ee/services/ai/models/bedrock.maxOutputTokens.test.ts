import { generateText } from 'ai';
import { createServer, type Server } from 'node:http';
import { fetch as realFetch } from 'undici';
import { z } from 'zod';
import { getBedrockModel } from './bedrock';
import {
    BEDROCK_MAX_OUTPUT_TOKENS,
    MODEL_PRESETS,
    type ReasoningEffort,
} from './presets';

const requestSchema = z.object({
    inferenceConfig: z.object({ maxTokens: z.number().optional() }).optional(),
    additionalModelRequestFields: z.object({
        thinking: z.object({ type: z.string() }),
        output_config: z.object({ effort: z.string() }).optional(),
    }),
});

describe('Bedrock output-token requests', () => {
    let server: Server;
    let baseUrl: string;
    let requests: z.infer<typeof requestSchema>[];

    beforeEach(async () => {
        requests = [];
        server = createServer(async (request, response) => {
            try {
                let data = '';
                request.setEncoding('utf8');
                for await (const chunk of request) data += String(chunk);
                requests.push(requestSchema.parse(JSON.parse(data)));
            } catch {
                response.writeHead(400).end();
                return;
            }
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(
                JSON.stringify({
                    output: {
                        message: {
                            role: 'assistant',
                            content: [{ text: 'Hello' }],
                        },
                    },
                    stopReason: 'end_turn',
                    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
                }),
            );
        });
        await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', resolve);
        });
        const address = server.address();
        if (address === null || typeof address === 'string') {
            throw new Error('Expected a loopback TCP address');
        }
        baseUrl = `http://127.0.0.1:${address.port}`;
        vi.stubGlobal('fetch', realFetch);
    });

    afterEach(async () => {
        vi.unstubAllGlobals();
        server.closeAllConnections();
        await new Promise<void>((resolve) => {
            server.close(() => resolve());
        });
    });

    const complete = async (
        modelName: string,
        reasoningEffort: ReasoningEffort,
        configOverride?: Pick<
            Parameters<typeof getBedrockModel>[0],
            'maxOutputTokens'
        >,
    ) => {
        const preset = MODEL_PRESETS.bedrock.find(
            (candidate) => candidate.name === modelName,
        );
        if (!preset) throw new Error(`Missing model preset: ${modelName}`);
        const { model, callOptions, providerOptions } = getBedrockModel(
            {
                apiKey: 'test',
                region: 'us-east-1',
                baseUrl,
                modelName,
                embeddingModelName: 'amazon.titan-embed-text-v2:0',
                customHeaders: {},
                supportsStreaming: true,
                ...configOverride,
            },
            preset,
            { enableReasoning: true, reasoningEffort },
        );
        const result = await generateText({
            model,
            ...callOptions,
            providerOptions,
            prompt: 'hi',
            maxRetries: 0,
        });
        expect(result.text).toBe('Hello');
        expect(requests).toHaveLength(1);
        return requests[0];
    };

    test('sends an explicit output budget with adaptive thinking at medium effort', async () => {
        const request = await complete('claude-opus-5-5', 'medium');
        expect(request.additionalModelRequestFields).toMatchObject({
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
        });
        expect(request.inferenceConfig?.maxTokens).toBe(
            BEDROCK_MAX_OUTPUT_TOKENS,
        );
    });

    test('preserves the explicit adaptive output budget at xhigh effort', async () => {
        const request = await complete('claude-opus-5-5', 'xhigh');
        expect(request.additionalModelRequestFields).toMatchObject({
            thinking: { type: 'adaptive' },
            output_config: { effort: 'xhigh' },
        });
        expect(request.inferenceConfig?.maxTokens).toBe(24_000);
    });

    test('sends the configured output cap with adaptive thinking', async () => {
        const request = await complete('claude-opus-5-5', 'medium', {
            maxOutputTokens: 32_000,
        });
        expect(request.inferenceConfig?.maxTokens).toBe(32_000);
    });

    test('adds the thinking budget on top of the configured output cap', async () => {
        const request = await complete('claude-haiku-4-5', 'medium', {
            maxOutputTokens: 32_000,
        });
        expect(request.inferenceConfig?.maxTokens).toBe(2048 + 32_000);
    });

    test('adds the thinking budget on top of the explicit output cap', async () => {
        const request = await complete('claude-haiku-4-5', 'medium');
        expect(request.additionalModelRequestFields.thinking.type).toBe(
            'enabled',
        );
        expect(request.inferenceConfig?.maxTokens).toBe(
            2048 + BEDROCK_MAX_OUTPUT_TOKENS,
        );
    });
});
