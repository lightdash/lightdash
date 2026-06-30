import { LambdaMicrovms } from '@aws-sdk/client-lambda-microvms';
import { MissingConfigError } from '@lightdash/common';
import { DockerSandboxProvider } from './DockerSandboxProvider';
import { E2bSandboxProvider } from './E2bSandboxProvider';
import {
    AwsMicrovmControlPlane,
    LambdaMicroVmSandboxProvider,
    type LambdaMicroVmConfig,
} from './LambdaMicroVmSandboxProvider';
import { SandboxManager, type SandboxRegistryStore } from './SandboxManager';
import { type SnapshotStore } from './SnapshotStore';
import { type SandboxLogger, type SandboxProvider } from './types';

export * from './errors';
export * from './SandboxManager';
export * from './SnapshotStore';
export * from './types';

export type SandboxProviderKind = 'e2b' | 'docker' | 'lambda-microvm';

/** Static, non-per-sandbox config the Lambda MicroVMs provider needs. */
export interface LambdaMicroVmProviderConfig extends LambdaMicroVmConfig {
    region: string;
}

export interface CreateSandboxProviderOptions {
    provider: SandboxProviderKind;
    e2bApiKey: string | null;
    dockerImage: string;
    /** Required when `provider === 'lambda-microvm'`; ignored otherwise. */
    lambdaMicroVm: LambdaMicroVmProviderConfig | null;
    /** Backing store for object-store snapshots (used by the Docker provider). */
    snapshotStore: SnapshotStore;
    logger: SandboxLogger;
}

/**
 * Build the sandbox provider selected by `SANDBOX_PROVIDER`. Throws a clear
 * config error when the chosen provider is missing required configuration.
 */
export const createSandboxProvider = (
    options: CreateSandboxProviderOptions,
): SandboxProvider => {
    switch (options.provider) {
        case 'e2b':
            if (!options.e2bApiKey) {
                throw new MissingConfigError(
                    'E2B API key is not configured (E2B_API_KEY)',
                );
            }
            return new E2bSandboxProvider(options.e2bApiKey);
        case 'docker':
            return new DockerSandboxProvider(
                options.dockerImage,
                options.logger,
                options.snapshotStore,
            );
        case 'lambda-microvm': {
            const config = options.lambdaMicroVm;
            if (!config) {
                throw new MissingConfigError(
                    'Lambda MicroVMs is not configured (LAMBDA_MICROVM_*)',
                );
            }
            if (!config.ingressConnectorArn || !config.egressConnectorArn) {
                throw new MissingConfigError(
                    'Lambda MicroVMs ingress/egress connector ARNs are not configured',
                );
            }
            const controlPlane = new AwsMicrovmControlPlane(
                new LambdaMicrovms({ region: config.region }),
            );
            return new LambdaMicroVmSandboxProvider(
                controlPlane,
                config,
                options.logger,
            );
        }
        default:
            throw new MissingConfigError(
                `Unknown SANDBOX_PROVIDER: ${options.provider as string}`,
            );
    }
};

export interface CreateSandboxManagerOptions {
    provider: SandboxProviderKind;
    e2bApiKey: string | null;
    dockerImage: string;
    lambdaMicroVm: LambdaMicroVmProviderConfig | null;
    snapshotStore: SnapshotStore;
    registryModel: SandboxRegistryStore;
    logger: SandboxLogger;
    idleTimeoutMs: number;
    snapshotRetentionMs: number;
}

/**
 * Build a {@link SandboxManager} over the configured provider. The single entry
 * point feature services and the reaper use to get a lifecycle surface.
 */
export const createSandboxManager = (
    options: CreateSandboxManagerOptions,
): SandboxManager => {
    const provider = createSandboxProvider({
        provider: options.provider,
        e2bApiKey: options.e2bApiKey,
        dockerImage: options.dockerImage,
        lambdaMicroVm: options.lambdaMicroVm,
        snapshotStore: options.snapshotStore,
        logger: options.logger,
    });
    return new SandboxManager({
        provider,
        providerKind: options.provider,
        snapshotStore: options.snapshotStore,
        registryModel: options.registryModel,
        logger: options.logger,
        idleTimeoutMs: options.idleTimeoutMs,
        snapshotRetentionMs: options.snapshotRetentionMs,
    });
};
