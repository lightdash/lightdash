import {
    FeatureFlags,
    ForbiddenError,
    getErrorMessage,
    MissingConfigError,
    type SessionUser,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import type { LightdashAnalytics } from '../../../analytics/LightdashAnalytics';
import type { LightdashConfig } from '../../../config/parseConfig';
import type { FeatureFlagModel } from '../../../models/FeatureFlagModel/FeatureFlagModel';
import type { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { BaseService } from '../../../services/BaseService';

const TEMPLATE_NAME =
    process.env.E2B_AGENTIC_WRITEBACK_TEMPLATE_NAME ||
    'lightdash-agentic-writeback';

// Hard ceiling on a single synchronous run. The HTTP request is held open for
// the duration, so keep this well under typical load-balancer/proxy timeouts.
const RUN_TIMEOUT_MS = 10 * 60 * 1000;

type AgenticWritebackServiceDeps = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    featureFlagModel: FeatureFlagModel;
};

export type AgenticWritebackRunResult = {
    output: string;
    exitCode: number;
};

export class AgenticWritebackService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly projectModel: ProjectModel;

    private readonly featureFlagModel: FeatureFlagModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        featureFlagModel,
    }: AgenticWritebackServiceDeps) {
        super({ serviceName: 'AgenticWritebackService' });
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.featureFlagModel = featureFlagModel;
    }

    private async assertEnabled(user: SessionUser): Promise<void> {
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.AgenticWriteback,
        });
        if (!enabled) {
            throw new ForbiddenError('Agentic writeback is not enabled');
        }
    }

    private getE2bApiKey(): string {
        const key = this.lightdashConfig.appRuntime.e2bApiKey;
        if (!key) {
            throw new MissingConfigError(
                'E2B API key is not configured (E2B_API_KEY)',
            );
        }
        return key;
    }

    private getAnthropicApiKey(): string {
        const key = this.lightdashConfig.ai.copilot.providers.anthropic?.apiKey;
        if (!key) {
            throw new MissingConfigError(
                'Anthropic API key is not configured (ANTHROPIC_API_KEY)',
            );
        }
        return key;
    }

    /**
     * Synchronously spin up a sandbox, run the given prompt through the Claude
     * Code CLI, and return the agent's text output. The sandbox is always
     * killed before returning so we never leak running containers.
     */
    async run(
        user: SessionUser,
        projectUuid: string,
        prompt: string,
    ): Promise<AgenticWritebackRunResult> {
        await this.assertEnabled(user);

        // Confirm the project exists (and the user can read it) before
        // spending money on a sandbox.
        await this.projectModel.getSummary(projectUuid);

        const e2bApiKey = this.getE2bApiKey();
        const anthropicApiKey = this.getAnthropicApiKey();

        const sandbox = await Sandbox.create(TEMPLATE_NAME, {
            apiKey: e2bApiKey,
            timeoutMs: RUN_TIMEOUT_MS,
        });
        this.logger.info(
            `AgenticWriteback: sandbox created (sandboxId=${sandbox.sandboxId}, project=${projectUuid})`,
        );

        try {
            // Write the prompt to a file so arbitrary content (quotes,
            // newlines, shell metacharacters) can't break the command line.
            await sandbox.files.write('/tmp/prompt.txt', prompt);

            const result = await sandbox.commands.run(
                'cat /tmp/prompt.txt | claude -p ' +
                    '--output-format text ' +
                    '--dangerously-skip-permissions',
                {
                    timeoutMs: RUN_TIMEOUT_MS,
                    envs: { ANTHROPIC_API_KEY: anthropicApiKey },
                    onStderr: (chunk) => {
                        this.logger.debug(
                            `AgenticWriteback: claude stderr: ${chunk.trimEnd()}`,
                        );
                    },
                },
            );

            this.logger.info(
                `AgenticWriteback: run completed (sandboxId=${sandbox.sandboxId}, exit=${result.exitCode})`,
            );

            return {
                output: result.stdout,
                exitCode: result.exitCode,
            };
        } finally {
            try {
                await sandbox.kill();
            } catch (error) {
                this.logger.warn(
                    `AgenticWriteback: failed to kill sandbox ${sandbox.sandboxId}: ${getErrorMessage(
                        error,
                    )}`,
                );
            }
        }
    }
}
