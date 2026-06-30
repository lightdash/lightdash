import { MissingConfigError } from '@lightdash/common';
import { DockerSandboxProvider } from './DockerSandboxProvider';
import { E2bSandboxProvider } from './E2bSandboxProvider';
import { SandboxManager, type SandboxRegistryStore } from './SandboxManager';
import { type SnapshotStore } from './SnapshotStore';
import { type SandboxLogger, type SandboxProvider } from './types';

export * from './errors';
export * from './SandboxManager';
export * from './SnapshotStore';
export * from './types';

export type SandboxProviderKind = 'e2b' | 'docker';

export interface CreateSandboxProviderOptions {
    provider: SandboxProviderKind;
    e2bApiKey: string | null;
    dockerImage: string;
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
