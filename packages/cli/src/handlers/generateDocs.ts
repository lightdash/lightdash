/**
 * Handler for `lightdash generate-docs`.
 *
 * Automates the workflow of generating dbt docs with Lightdash metrics
 * visible in the lineage graph. Without this command, users would need to
 * manually run dbt compile, inject metric nodes, then dbt docs generate
 * and serve. This command does all of that in one step.
 *
 * The key insight is that we compile into an isolated directory
 * (target/lightdash_docs/), inject metrics into that manifest, then run
 * `dbt docs generate --no-compile` pointing at the same directory. Since
 * --no-compile skips writing manifest.json, our injected version is picked
 * up by the docs generator (including the --static HTML embedding).
 *
 * This means we never touch the project's real target/ manifest, and we
 * don't need to post-patch the static HTML. The lightdash_docs/ directory
 * persists between runs and is overwritten on each invocation.
 *
 * Supports two output modes:
 *   - Server mode (default): runs `dbt docs serve` to view interactively
 *   - Static mode (--static): produces a self-contained HTML file
 */
import { getErrorMessage } from '@lightdash/common';
import execa from 'execa';
import { promises as fs } from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import GlobalState from '../globalState';
import { injectLightdashLineage } from './injectLightdashLineage';

type GenerateDocsHandlerOptions = {
    projectDir: string;
    profilesDir: string;
    target?: string;
    targetPath?: string;
    verbose: boolean;
    skipInject: boolean;
    static: boolean;
    serve: boolean;
    port: number;
};

const LIGHTDASH_DOCS_DIR = 'lightdash_docs';

/** Build the common dbt CLI flags shared across compile, generate, and serve steps */
function buildCommonDbtArgs(
    absoluteProjectDir: string,
    options: Pick<
        GenerateDocsHandlerOptions,
        'projectDir' | 'profilesDir' | 'target'
    >,
): string[] {
    const args: string[] = [];
    if (options.projectDir) {
        args.push('--project-dir', absoluteProjectDir);
    }
    if (options.profilesDir) {
        args.push('--profiles-dir', options.profilesDir);
    }
    if (options.target) {
        args.push('--target', options.target);
    }
    return args;
}

export const generateDocsHandler = async (
    options: GenerateDocsHandlerOptions,
) => {
    GlobalState.setVerbose(options.verbose);
    const executionId = uuidv4();

    const startTime = Date.now();
    await LightdashAnalytics.track({
        event: 'generate_docs.started',
        properties: { executionId },
    });

    const absoluteProjectDir = path.resolve(options.projectDir);
    const targetDir = options.targetPath
        ? path.resolve(options.targetPath)
        : path.join(absoluteProjectDir, 'target');
    const ldDocsDir = path.join(targetDir, LIGHTDASH_DOCS_DIR);
    const commonArgs = buildCommonDbtArgs(absoluteProjectDir, options);

    // Create the isolated working directory
    await fs.mkdir(ldDocsDir, { recursive: true });

    // Step 1: Compile into the isolated directory to produce manifest.json
    // This leaves the project's real target/ untouched.
    const compileSpinner = GlobalState.startSpinner(
        '  Compiling dbt project...',
    );
    try {
        const compileArgs = [
            'compile',
            '--target-path',
            ldDocsDir,
            ...commonArgs,
        ];

        GlobalState.debug(`> Running: dbt ${compileArgs.join(' ')}`);
        await execa('dbt', compileArgs);
        compileSpinner.succeed('  Compiled dbt project');
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
        compileSpinner.fail('  Failed to compile dbt project');
        await LightdashAnalytics.track({
            event: 'generate_docs.error',
            properties: {
                executionId,
                step: 'dbt_compile',
                error: msg,
            },
        });
        throw new Error(`Failed to run dbt compile:\n  ${msg}`);
    }

    // Step 2: Inject Lightdash metric nodes into the manifest so they
    // appear on the dbt lineage graph (see injectLightdashLineage.ts)
    const manifestPath = path.join(ldDocsDir, 'manifest.json');
    if (!options.skipInject) {
        const injectSpinner = GlobalState.startSpinner(
            '  Injecting Lightdash metrics into manifest...',
        );
        try {
            const result = await injectLightdashLineage(manifestPath);
            injectSpinner.succeed(
                `  Injected ${result.semanticModelCount} semantic models and ${result.metricCount} metrics`,
            );
        } catch (e: unknown) {
            const msg = getErrorMessage(e);
            injectSpinner.fail('  Failed to inject Lightdash metrics');
            await LightdashAnalytics.track({
                event: 'generate_docs.error',
                properties: {
                    executionId,
                    step: 'inject_lineage',
                    error: msg,
                },
            });
            throw new Error(`Failed to inject Lightdash lineage:\n  ${msg}`);
        }
    }

    // Step 3: Generate docs with --no-compile so dbt doesn't overwrite our
    // injected manifest. It will generate catalog.json, index.html, and
    // (if --static) static_index.html reading our manifest from disk.
    const generateSpinner = GlobalState.startSpinner(
        '  Generating docs catalog...',
    );
    try {
        const generateArgs = [
            'docs',
            'generate',
            '--no-compile',
            '--target-path',
            ldDocsDir,
            ...commonArgs,
        ];
        if (options.static) {
            generateArgs.push('--static');
        }

        GlobalState.debug(`> Running: dbt ${generateArgs.join(' ')}`);
        await execa('dbt', generateArgs);
        generateSpinner.succeed('  Generated docs catalog');
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
        generateSpinner.fail('  Failed to generate docs catalog');
        await LightdashAnalytics.track({
            event: 'generate_docs.error',
            properties: {
                executionId,
                step: 'dbt_docs_generate',
                error: msg,
            },
        });
        throw new Error(`Failed to run dbt docs generate:\n  ${msg}`);
    }

    await LightdashAnalytics.track({
        event: 'generate_docs.completed',
        properties: {
            executionId,
            durationMs: Date.now() - startTime,
            skipInject: options.skipInject,
            serve: options.serve,
        },
    });

    // Step 4: Output the result.
    if (options.static) {
        const staticIndexPath = path.join(ldDocsDir, 'static_index.html');
        console.info(`\n  Static docs written to: ${staticIndexPath}`);
        console.info('  Open this file directly in your browser.\n');
    } else if (options.serve) {
        const url = `http://localhost:${options.port}`;
        console.info(`\n  Serving docs at: ${url}`);
        console.info('  Press Ctrl+C to stop.\n');

        const serveArgs = [
            'docs',
            'serve',
            '--port',
            String(options.port),
            '--target-path',
            ldDocsDir,
            ...commonArgs,
        ];

        GlobalState.debug(`> Running: dbt ${serveArgs.join(' ')}`);
        await execa('dbt', serveArgs, {
            stdio: ['inherit', 'ignore', 'ignore'],
        });
    }
};
