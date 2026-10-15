import { MissingConfigError } from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    createSandboxProvider,
    S3SnapshotStore,
    type SandboxLogger,
    type SandboxProvider,
    type SandboxSpec,
} from '../../../ee/services/SandboxRuntime';

/** Added to every requested lifetime so a sandbox is never reaped mid-read. */
export const SANDBOX_IDLE_MARGIN_MS = 60_000;

export type OneShotSandboxProviderArgs = {
    lightdashConfig: LightdashConfig;
    logger: SandboxLogger;
    /** Overrides the configured provider; null resolves it lazily from config. */
    provider: SandboxProvider | null;
    dockerImage: string;
    e2bTemplateName: string;
    e2bTemplateTag: string;
    /** Names the feature in the missing-configuration error, e.g. "Python queries". */
    runnerLabel: string;
};

/**
 * The provider, template and spec for sandboxes created per run and destroyed
 * after it: e2b or docker only, no egress, never suspended.
 */
export class OneShotSandboxProvider {
    private readonly args: OneShotSandboxProviderArgs;

    private provider: SandboxProvider | null;

    constructor(args: OneShotSandboxProviderArgs) {
        this.args = args;
        this.provider = args.provider;
    }

    get providerName(): string {
        return this.args.lightdashConfig.appRuntime.sandboxProvider;
    }

    /** Throws {@link MissingConfigError} when the configuration cannot create a provider. */
    get(): SandboxProvider {
        if (!this.provider) {
            const { lightdashConfig, logger, dockerImage, runnerLabel } =
                this.args;
            const { appRuntime } = lightdashConfig;
            if (
                appRuntime.sandboxProvider !== 'e2b' &&
                appRuntime.sandboxProvider !== 'docker'
            ) {
                throw new MissingConfigError(
                    `${runnerLabel} need the e2b or docker sandbox provider (SANDBOX_PROVIDER), got ${appRuntime.sandboxProvider}`,
                );
            }
            this.provider = createSandboxProvider({
                provider: appRuntime.sandboxProvider,
                e2bApiKey: appRuntime.e2bApiKey,
                dockerImage,
                lambdaMicroVm: null,
                azureSandboxes: null,
                gcpCloudRun: null,
                // One-shot sandboxes are never suspended; the Docker provider
                // still requires a store at construction.
                snapshotStore:
                    appRuntime.sandboxProvider === 'docker'
                        ? new S3SnapshotStore({ lightdashConfig })
                        : null,
                logger,
            });
        }
        return this.provider;
    }

    get templateRef(): string {
        const { e2bTemplateName, e2bTemplateTag, dockerImage } = this.args;
        return this.providerName === 'e2b'
            ? `${e2bTemplateName}:${e2bTemplateTag}`
            : dockerImage;
    }

    /** Version prefix for cache keys: provider and template, before the runner hash. */
    versionOf(runnerHash: string): string {
        return `${this.providerName}:${this.templateRef}:${runnerHash}`;
    }

    /** The sandbox outlives the command timeout by a margin so it is never reaped mid-read. */
    buildSpec(timeoutMs: number): SandboxSpec {
        return {
            templateRef: this.templateRef,
            timeoutMs: timeoutMs + SANDBOX_IDLE_MARGIN_MS,
            egress: { allow: [] },
        };
    }
}
