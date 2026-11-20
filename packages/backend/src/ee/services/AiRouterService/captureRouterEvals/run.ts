/**
 * Runs every fixture in ./fixtures through the real sorter model and reports
 * pass or fail for each. Run it by hand after changing the prompt or the
 * request shape in ../captureRouter.ts. It calls a model, so it needs a key
 * and is not part of CI.
 *
 *   AI_DEFAULT_PROVIDER=anthropic ANTHROPIC_API_KEY=... pnpm -F backend capture-router-evals
 *
 * The model comes from the same environment variables the backend reads
 * (AI_DEFAULT_PROVIDER, which defaults to openai, plus that provider's key and
 * optional model name), so it is the model an instance with those variables
 * would use.
 */
import { aiCopilotConfigSchema } from '../../../../config/aiConfigSchema';
import { getAiConfig } from '../../../../config/parseConfig';
import { routeCaptureWithModel } from '../captureRouter';
import { compareCaptureRoute } from './compareCaptureRoute';
import { loadCaptureRouterEvalFixtures } from './fixtures';

/* eslint-disable no-console */

const KEY_VARIABLES: Record<string, string> = {
    openai: 'OPENAI_API_KEY',
    anthropic: 'ANTHROPIC_API_KEY',
    azure: 'AZURE_AI_API_KEY',
    google: 'GEMINI_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
};

const main = async (): Promise<number> => {
    const rawConfig = getAiConfig();
    const provider = rawConfig.defaultProvider;
    const providers: Record<string, unknown> = rawConfig.providers;
    if (!providers[provider]) {
        const variable = KEY_VARIABLES[provider];
        console.error(
            variable
                ? `No model key configured: set ${variable} (the key for AI_DEFAULT_PROVIDER "${provider}"), or point AI_DEFAULT_PROVIDER at a provider whose key is set.`
                : `No model credentials configured for AI_DEFAULT_PROVIDER "${provider}": set that provider's variables, or point AI_DEFAULT_PROVIDER at a provider whose key is set.`,
        );
        return 1;
    }

    // Loading the model builders loads the whole backend config, which refuses
    // to start without these. Nothing here uses them, so placeholders will do.
    process.env.LIGHTDASH_SECRET ??= 'capture-router-evals-only';
    process.env.S3_ENDPOINT ??= 'http://localhost';
    process.env.S3_BUCKET ??= 'capture-router-evals-only';
    process.env.S3_REGION ??= 'local';
    const { getModel } = await import('../../ai/models');
    const { model } = getModel(aiCopilotConfigSchema.parse(rawConfig));
    const fixtures = loadCaptureRouterEvalFixtures();
    console.log(
        `Running ${fixtures.length} fixtures against ${provider} ${typeof model === 'string' ? model : model.modelId}`,
    );

    const results = await Promise.all(
        fixtures.map(async ({ file, fixture }) => {
            try {
                const actual = await routeCaptureWithModel({
                    model,
                    request: fixture.request,
                });
                return compareCaptureRoute({
                    expected: fixture.expected,
                    actual,
                    tiles: fixture.request.tiles,
                    piles: fixture.piles,
                });
            } catch (error) {
                return [
                    `model call failed for ${file}: ${error instanceof Error ? error.message : String(error)}`,
                ];
            }
        }),
    );

    results.forEach((differences, index) => {
        const { file, fixture } = fixtures[index];
        const label = `${file.replace(/\.json$/, '')}: ${fixture.name}`;
        if (differences.length === 0) {
            console.log(`PASS ${label}`);
        } else {
            console.log(`FAIL ${label} [${differences.join('; ')}]`);
        }
    });

    const failed = results.filter(
        (differences) => differences.length > 0,
    ).length;
    console.log(`${fixtures.length - failed} of ${fixtures.length} passed`);
    return failed === 0 ? 0 : 1;
};

main()
    .then((code) => process.exit(code))
    .catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    });
