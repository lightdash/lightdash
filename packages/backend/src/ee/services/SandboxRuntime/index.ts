import { MissingConfigError } from '@lightdash/common';
import { DockerSandboxProvider } from './DockerSandboxProvider';
import { E2bSandboxProvider } from './E2bSandboxProvider';
import { type SandboxLogger, type SandboxProvider } from './types';

export * from './errors';
export * from './types';

export type SandboxProviderKind = 'e2b' | 'docker';

export interface CreateSandboxProviderOptions {
    provider: SandboxProviderKind;
    e2bApiKey: string | null;
    dockerImage: string;
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
            );
        default:
            throw new MissingConfigError(
                `Unknown SANDBOX_PROVIDER: ${options.provider as string}`,
            );
    }
};
