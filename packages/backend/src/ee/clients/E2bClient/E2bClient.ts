import {
    ForbiddenError,
    NotFoundError,
    UnexpectedServerError,
} from '@lightdash/common';
import { Sandbox } from 'e2b';
import { LightdashConfig } from '../../../config/parseConfig';
import Logger from '../../../logging/logger';

const E2B_TEMPLATE_ID = 'c569hyx93rikig96f41g';
const SANDBOX_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface E2bSandboxConfig {
    lightdashDomain: string;
    anthropicApiKey: string;
    githubToken: string;
    lightdashApiKey: string;
    lightdashProjectUuid: string;
}

export interface StreamEvent {
    type: string;
    session_id?: string;
    event?: {
        type?: string;
        content_block?: {
            type?: string;
            name?: string;
            id?: string;
        };
        delta?: {
            type?: string;
            text?: string;
            partial_json?: string;
        };
    };
    result?: string;
}

export interface ToolCallbacks {
    onToolStart?: (toolName: string, toolUseId: string) => void;
    onToolInputDelta?: (partialJson: string) => void;
    onToolEnd?: () => void;
}

const getNetworkConfig = (lightdashDomain: string) => ({
    allowOut: [
        'api.anthropic.com',
        lightdashDomain,
        'github.com',
        '*.github.com',
    ],
    denyOut: ['0.0.0.0/0'],
});

const processStreamLine = (
    line: string,
    sessionId: string | null,
    onToken?: (token: string) => void,
    onSessionId?: (sessionId: string) => void,
    toolCallbacks?: ToolCallbacks,
): { sessionId: string | null; result: string | null } => {
    try {
        const event: StreamEvent = JSON.parse(line);

        let newSessionId = sessionId;
        let result: string | null = null;

        // Capture session ID
        if (event.session_id && !sessionId) {
            newSessionId = event.session_id;
            onSessionId?.(newSessionId);
        }

        // Handle stream_event types from Claude SDK
        if (event.type === 'stream_event' && event.event) {
            const { type: eventType, content_block, delta } = event.event;

            // Tool call starting
            if (
                eventType === 'content_block_start' &&
                content_block?.type === 'tool_use' &&
                content_block.name &&
                content_block.id
            ) {
                toolCallbacks?.onToolStart?.(
                    content_block.name,
                    content_block.id,
                );
            }

            // Tool input streaming
            if (
                eventType === 'content_block_delta' &&
                delta?.type === 'input_json_delta' &&
                delta.partial_json
            ) {
                toolCallbacks?.onToolInputDelta?.(delta.partial_json);
            }

            // Content block ended (could be text or tool)
            if (eventType === 'content_block_stop') {
                toolCallbacks?.onToolEnd?.();
            }

            // Text tokens
            if (delta?.type === 'text_delta' && delta.text) {
                onToken?.(delta.text);
            }
        }

        // Capture final result
        if (event.result) {
            result = event.result;
        }

        return { sessionId: newSessionId, result };
    } catch {
        // Not JSON, skip
        return { sessionId, result: null };
    }
};

export class E2bClient {
    private readonly lightdashConfig: LightdashConfig;

    constructor({ lightdashConfig }: { lightdashConfig: LightdashConfig }) {
        this.lightdashConfig = lightdashConfig;

        if (!this.lightdashConfig.e2b?.apiKey) {
            throw new Error('E2B API key not configured');
        }
    }

    async createSandbox(config: E2bSandboxConfig): Promise<Sandbox> {
        Logger.info('Creating E2B sandbox', {
            templateId: E2B_TEMPLATE_ID,
            lightdashDomain: config.lightdashDomain,
            projectUuid: config.lightdashProjectUuid,
        });
        try {
            const sandbox = await Sandbox.create(E2B_TEMPLATE_ID, {
                timeoutMs: SANDBOX_TIMEOUT_MS,
                apiKey: this.lightdashConfig.e2b!.apiKey,
                network: getNetworkConfig(config.lightdashDomain),
            });
            Logger.info('E2B sandbox created successfully', {
                sandboxId: sandbox.sandboxId,
                projectUuid: config.lightdashProjectUuid,
            });
            return sandbox;
        } catch (error) {
            Logger.error('Failed to create E2B sandbox', {
                error: error instanceof Error ? error.message : 'Unknown error',
                projectUuid: config.lightdashProjectUuid,
            });
            throw new UnexpectedServerError(
                `Failed to create E2B sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
        }
    }

    async resumeSandbox(sandboxId: string): Promise<Sandbox> {
        Logger.info('Resuming E2B sandbox', { sandboxId });
        try {
            const sandbox = await Sandbox.connect(sandboxId, {
                apiKey: this.lightdashConfig.e2b!.apiKey,
            });
            await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
            Logger.info('E2B sandbox resumed successfully', { sandboxId });
            return sandbox;
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';

            Logger.info('Failed to resume E2B sandbox', {
                sandboxId,
                error: errorMessage,
            });

            // Handle common E2B errors with user-friendly messages
            if (
                errorMessage.includes('not found') ||
                errorMessage.includes('404')
            ) {
                throw new NotFoundError(
                    'Coding session has expired. Please create a new session.',
                );
            }
            if (
                errorMessage.includes('forbidden') ||
                errorMessage.includes('403')
            ) {
                throw new ForbiddenError(
                    'Unable to access coding session. It may have been deleted.',
                );
            }
            throw new UnexpectedServerError(
                `Failed to resume coding session: ${errorMessage}`,
            );
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async pauseSandbox(sandbox: Sandbox): Promise<void> {
        Logger.info('Pausing E2B sandbox', { sandboxId: sandbox.sandboxId });
        try {
            await sandbox.betaPause();
            Logger.info('E2B sandbox paused successfully', {
                sandboxId: sandbox.sandboxId,
            });
        } catch (error) {
            // Log but don't throw - pausing is best-effort
            Logger.warn('Failed to pause E2B sandbox', {
                sandboxId: sandbox.sandboxId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    async killSandbox(sandboxId: string): Promise<void> {
        try {
            const sandbox = await Sandbox.connect(sandboxId, {
                apiKey: this.lightdashConfig.e2b!.apiKey,
            });
            await sandbox.kill();
        } catch (error) {
            // Ignore errors when killing - sandbox may already be gone
            Logger.warn('Failed to kill sandbox (may already be expired)', {
                sandboxId,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async cloneRepository(
        sandbox: Sandbox,
        repository: string,
        branch: string,
        githubToken: string,
    ): Promise<void> {
        Logger.info('Cloning repository in sandbox', {
            sandboxId: sandbox.sandboxId,
            repository,
            branch,
        });

        const repoPath = '/home/user/repo';
        const repoUrl = `https://github.com/${repository}.git`;

        // Configure git credentials using E2B git integration
        await sandbox.git.dangerouslyAuthenticate({
            username: 'oauth2',
            password: githubToken,
        });

        // Configure git user
        await sandbox.git.configureUser('Lightdash Agent', 'sandbox@lightdash.com');

        // Clone repository
        await sandbox.git.clone(repoUrl, { path: repoPath });

        // Checkout or create branch (using shell for -B flag which creates if not exists)
        const branchResult = await sandbox.commands.run(
            `git -C ${repoPath} checkout -B ${branch}`,
        );

        if (branchResult.exitCode !== 0) {
            Logger.error('Failed to checkout branch', {
                sandboxId: sandbox.sandboxId,
                branch,
                stderr: branchResult.stderr,
            });
            throw new UnexpectedServerError(
                `Failed to checkout branch: ${branchResult.stderr}`,
            );
        }

        Logger.info('Repository cloned successfully', {
            sandboxId: sandbox.sandboxId,
            repository,
            branch,
        });
    }

    // eslint-disable-next-line class-methods-use-this
    async commitAndPush(
        sandbox: Sandbox,
        branch: string,
        commitMessage: string,
    ): Promise<void> {
        const repoPath = '/home/user/repo';

        Logger.info('Committing and pushing changes', {
            sandboxId: sandbox.sandboxId,
            branch,
        });

        // Check if there are any changes to commit
        const status = await sandbox.git.status(repoPath);

        if (!status.fileStatus || status.fileStatus.length === 0) {
            Logger.info('No changes to commit', {
                sandboxId: sandbox.sandboxId,
            });
            return;
        }

        // Stage all changes
        await sandbox.git.add(repoPath);

        // Commit changes
        await sandbox.git.commit(repoPath, commitMessage, {
            authorName: 'Lightdash Agent',
            authorEmail: 'sandbox@lightdash.com',
        });

        // Force push to branch (using shell since E2B API doesn't have force option)
        const pushResult = await sandbox.commands.run(
            `git -C ${repoPath} push --force origin ${branch}`,
        );

        if (pushResult.exitCode !== 0) {
            Logger.error('Failed to push changes', {
                sandboxId: sandbox.sandboxId,
                branch,
                stderr: pushResult.stderr,
            });
            throw new UnexpectedServerError(
                `Failed to push changes: ${pushResult.stderr}`,
            );
        }

        Logger.info('Changes committed and pushed successfully', {
            sandboxId: sandbox.sandboxId,
            branch,
        });
    }

    // eslint-disable-next-line class-methods-use-this
    async verifyLightdashCli(
        sandbox: Sandbox,
        envs: Record<string, string>,
    ): Promise<void> {
        Logger.info('Verifying Lightdash CLI in sandbox', {
            sandboxId: sandbox.sandboxId,
        });

        const result = await sandbox.commands.run(
            'lightdash config list-projects',
            { envs, timeoutMs: 30000 },
        );

        if (result.exitCode !== 0) {
            Logger.error('Lightdash CLI verification failed', {
                sandboxId: sandbox.sandboxId,
                exitCode: result.exitCode,
                stderr: result.stderr,
                stdout: result.stdout,
            });
            throw new UnexpectedServerError(
                `Lightdash CLI is not working in sandbox: ${result.stderr || result.stdout}`,
            );
        }

        Logger.info('Lightdash CLI verified successfully', {
            sandboxId: sandbox.sandboxId,
            output: result.stdout,
        });
    }

    // eslint-disable-next-line class-methods-use-this
    async runClaudeStreaming(
        sandbox: Sandbox,
        prompt: string,
        envs: Record<string, string>,
        resumeSessionId?: string,
        onToken?: (token: string) => void,
        onSessionId?: (sessionId: string) => void,
        toolCallbacks?: ToolCallbacks,
    ): Promise<{ sessionId: string | null; result: string }> {
        Logger.info('Running Claude in sandbox', {
            sandboxId: sandbox.sandboxId,
            resumeSessionId: resumeSessionId || null,
            promptLength: prompt.length,
        });

        const escapedPrompt = prompt.replace(/'/g, "'\\''");
        let sessionId: string | null = resumeSessionId || null;
        let result = '';
        let buffer = '';
        let stderrBuffer = '';
        let stdoutBuffer = ''; // Raw stdout for debugging

        const resumeFlag = resumeSessionId
            ? `--resume "${resumeSessionId}"`
            : '';
        const appendSystemPrompt = `--append-system-prompt "You're developing a Lightdash project. Always use the lightdash skills and lightdash cli. When mentioning Lightdash content (charts, dashboards, explores, etc.), always provide the full URL so users can navigate directly to it."`;
        const command = `cd /home/user/repo && echo '${escapedPrompt}' | claude -p --dangerously-skip-permissions --settings /home/user/.claude/settings.json ${resumeFlag} ${appendSystemPrompt} --output-format stream-json --verbose --include-partial-messages`;

        Logger.debug('Executing Claude command', {
            sandboxId: sandbox.sandboxId,
            command,
        });

        let commandResult;
        try {
            commandResult = await sandbox.commands.run(command, {
                timeoutMs: 0, // Unlimited for Claude
                envs,
                onStdout: (data) => {
                    stdoutBuffer += data; // Capture raw stdout for debugging
                    buffer += data;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    lines
                        .filter((line) => line.trim())
                        .forEach((line) => {
                            const processed = processStreamLine(
                                line,
                                sessionId,
                                onToken,
                                onSessionId,
                                toolCallbacks,
                            );
                            if (processed.sessionId) {
                                sessionId = processed.sessionId;
                            }
                            if (processed.result) {
                                result = processed.result;
                            }
                        });
                },
                onStderr: (data) => {
                    stderrBuffer += data;
                },
            });
        } catch (commandError) {
            // Truncate buffers for logging (last 2000 chars)
            const truncatedStdout = stdoutBuffer.slice(-2000);
            const truncatedStderr = stderrBuffer.slice(-2000);

            Logger.error('Claude command threw exception', {
                sandboxId: sandbox.sandboxId,
                error:
                    commandError instanceof Error
                        ? commandError.message
                        : 'Unknown error',
                stderr: truncatedStderr || '(empty)',
                stdout: truncatedStdout || '(empty)',
                stdoutLength: stdoutBuffer.length,
                stderrLength: stderrBuffer.length,
                partialResult: result.slice(-500) || '(empty)',
                capturedSessionId: sessionId,
                stack:
                    commandError instanceof Error
                        ? commandError.stack
                        : undefined,
            });
            throw new UnexpectedServerError(
                `Claude command failed: ${commandError instanceof Error ? commandError.message : 'Unknown error'}. Stderr: ${truncatedStderr || 'none'}. Stdout (last 500): ${stdoutBuffer.slice(-500) || 'none'}`,
            );
        }

        // Check exit code and log any errors
        if (commandResult.exitCode !== 0) {
            Logger.error('Claude command failed with non-zero exit', {
                sandboxId: sandbox.sandboxId,
                exitCode: commandResult.exitCode,
                stderr: stderrBuffer || commandResult.stderr,
                stdout: commandResult.stdout,
            });
            throw new UnexpectedServerError(
                `Claude command failed with exit code ${commandResult.exitCode}: ${stderrBuffer || commandResult.stderr || 'No error details'}`,
            );
        }

        // Process remaining buffer
        if (buffer.trim()) {
            const processed = processStreamLine(
                buffer,
                sessionId,
                onToken,
                onSessionId,
                toolCallbacks,
            );
            if (processed.sessionId) {
                sessionId = processed.sessionId;
            }
            if (processed.result) {
                result = processed.result;
            }
        }

        Logger.info('Claude streaming completed', {
            sandboxId: sandbox.sandboxId,
            sessionId,
            resultLength: result.length,
        });

        return { sessionId, result };
    }
}
