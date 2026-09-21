import { createVertex } from '@ai-sdk/google-vertex';
import { assertUnreachable } from '@lightdash/common';
import { LanguageModelMiddleware, wrapLanguageModel } from 'ai';
import { AsyncLocalStorage } from 'node:async_hooks';
import { z } from 'zod';
import { LightdashConfig } from '../../../../config/parseConfig';
import { AiModel } from './types';

type VertexConfig = NonNullable<
    LightdashConfig['ai']['copilot']['providers']['vertex']
>;

type VertexModel = ReturnType<ReturnType<typeof createVertex>>;

// One context manager, with separate stores for concurrent model invocations.
const toolContext = new AsyncLocalStorage<
    Parameters<VertexModel['doGenerate']>[0]['tools']
>();

const vertexRequestSchema = z.looseObject({
    tools: z
        .array(
            z.looseObject({
                functionDeclarations: z
                    .array(z.looseObject({ name: z.string() }))
                    .optional(),
            }),
        )
        .optional(),
});

const createJsonSchemaTransport = () => {
    // Keep the original schemas scoped to each invocation, including concurrent
    // calls and retries. The SDK's OpenAPI conversion loses JSON Schema details.
    const middleware: LanguageModelMiddleware = {
        specificationVersion: 'v3',
        wrapGenerate: ({ params, doGenerate }) =>
            toolContext.run(params.tools, doGenerate),
        wrapStream: ({ params, doStream }) =>
            toolContext.run(params.tools, doStream),
    };
    const vertexFetch: typeof fetch = async (url, init) => {
        const tools = toolContext.getStore();
        if (!tools?.length || typeof init?.body !== 'string') {
            return fetch(url, init);
        }
        const body = vertexRequestSchema.parse(JSON.parse(init.body));
        const requestTools = body.tools?.map((entry) => ({
            ...entry,
            ...(entry.functionDeclarations && {
                functionDeclarations: entry.functionDeclarations.map(
                    (declaration) => {
                        const tool = tools.find(
                            (candidate) =>
                                candidate.type === 'function' &&
                                candidate.name === declaration.name,
                        );
                        if (tool?.type !== 'function') return declaration;
                        return {
                            ...declaration,
                            parameters: undefined,
                            parametersJsonSchema: tool.inputSchema,
                        };
                    },
                ),
            }),
        }));
        return fetch(url, {
            ...init,
            body: JSON.stringify({ ...body, tools: requestTools }),
        });
    };
    return { middleware, fetch: vertexFetch };
};

const getVertexModel = (
    { auth, modelName }: VertexConfig,
    vertexFetch: typeof fetch,
) => {
    // Use generateContent for both auth methods. Vertex Interactions support
    // differs from the Gemini Developer API: our September 2026 Gemini probes
    // failed, and the SDK rejects Interactions with Express Mode API keys.
    // Recheck model and auth support before switching to .interactions().
    switch (auth.type) {
        case 'api-key':
            return createVertex({ apiKey: auth.apiKey, fetch: vertexFetch })(
                modelName,
            );
        case 'adc':
            return createVertex({
                // Prevent the SDK from falling back to an ambient API key.
                apiKey: '',
                project: auth.project,
                location: auth.location,
                fetch: vertexFetch,
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
): AiModel<'vertex'> => {
    const transport = createJsonSchemaTransport();
    return {
        model: wrapLanguageModel({
            model: getVertexModel(config, transport.fetch),
            // The SDK uses google.vertex.*. Keep routing and usage attribution
            // distinct from the Gemini Developer API provider named google.
            providerId: 'vertex',
            middleware: transport.middleware,
        }),
        // Model IDs are configured by the instance, so leave model-specific
        // sampling and thinking settings to Google's defaults.
        callOptions: {},
        providerOptions: undefined,
    };
};
