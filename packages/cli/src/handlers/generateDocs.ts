/**
 * Handler for `lightdash generate-docs`.
 *
 * Automates the workflow of generating dbt docs with Lightdash metrics
 * visible in the lineage graph. Without this command, users would need to
 * manually run dbt docs generate, then a separate script to inject metric
 * nodes, then dbt docs serve. This command does all three in one step.
 *
 * Supports two output modes:
 *   - Server mode (default): runs `dbt docs serve` to view interactively
 *   - Static mode (--static): produces a self-contained HTML file
 */
import { getErrorMessage } from '@lightdash/common';
import execa from 'execa';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { LightdashAnalytics } from '../analytics/analytics';
import GlobalState from '../globalState';
import {
    getTargetFilePath,
    injectLightdashLineage,
    patchStaticIndex,
} from './injectLightdashLineage';

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

/** Build the common dbt CLI flags shared across generate and serve steps */
function buildCommonDbtArgs(
    absoluteProjectDir: string,
    options: Pick<
        GenerateDocsHandlerOptions,
        'projectDir' | 'profilesDir' | 'target'
    >,
    absoluteTargetPath: string | undefined,
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
    if (absoluteTargetPath) {
        args.push('--target-path', absoluteTargetPath);
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
    const absoluteTargetPath = options.targetPath
        ? path.resolve(options.targetPath)
        : undefined;
    const commonArgs = buildCommonDbtArgs(
        absoluteProjectDir,
        options,
        absoluteTargetPath,
    );

    // Step 1: Run dbt docs generate
    // dbt output streams directly to the terminal via stdio: 'inherit'
    try {
        const generateArgs = ['docs', 'generate'];
        if (options.static) {
            generateArgs.push('--static');
        }
        generateArgs.push(...commonArgs);

        GlobalState.debug(`> Running: dbt ${generateArgs.join(' ')}`);
        await execa('dbt', generateArgs, { stdio: 'inherit' });
    } catch (e: unknown) {
        const msg = getErrorMessage(e);
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

    // Step 2: Inject Lightdash metric nodes into the manifest so they
    // appear on the dbt lineage graph (see injectLightdashLineage.ts)
    const manifestPath = getTargetFilePath(
        absoluteProjectDir,
        absoluteTargetPath,
        'manifest.json',
    );
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

        // Step 2b: If --static, the HTML file was generated BEFORE we injected,
        // so we need to replace the embedded manifest with our modified version
        if (options.static) {
            const staticSpinner = GlobalState.startSpinner(
                '  Patching static docs with injected metrics...',
            );
            try {
                const staticIndexPath = getTargetFilePath(
                    absoluteProjectDir,
                    absoluteTargetPath,
                    'static_index.html',
                );
                await patchStaticIndex(manifestPath, staticIndexPath);
                staticSpinner.succeed(
                    '  Static docs updated with Lightdash metrics',
                );
            } catch (e: unknown) {
                const msg = getErrorMessage(e);
                staticSpinner.fail('  Failed to patch static docs');
                await LightdashAnalytics.track({
                    event: 'generate_docs.error',
                    properties: {
                        executionId,
                        step: 'patch_static',
                        error: msg,
                    },
                });
                throw new Error(`Failed to patch static_index.html:\n  ${msg}`);
            }
        }
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

    // Step 3: Either print the static file path or start a local server.
    // --static and --serve are mutually exclusive: static outputs a file,
    // serve starts dbt's built-in HTTP server for interactive browsing.
    if (options.static) {
        const staticIndexPath = getTargetFilePath(
            absoluteProjectDir,
            absoluteTargetPath,
            'static_index.html',
        );
        console.info(`\n  Static docs written to: ${staticIndexPath}`);
        console.info('  Open this file directly in your browser.\n');
    } else if (options.serve) {
        console.info(
            `\n  Serving docs on port ${options.port}. Press Ctrl+C to stop.\n`,
        );

        const serveArgs = [
            'docs',
            'serve',
            '--port',
            String(options.port),
            ...commonArgs,
        ];

        GlobalState.debug(`> Running: dbt ${serveArgs.join(' ')}`);
        await execa('dbt', serveArgs, { stdio: 'inherit' });
    }
};
