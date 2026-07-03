import { LambdaMicrovms } from '@aws-sdk/client-lambda-microvms';
import { DefaultAzureCredential } from '@azure/identity';
import { assertUnreachable, MissingConfigError } from '@lightdash/common';
import { type LightdashConfig } from '../../../config/parseConfig';
import {
    AzureContainerAppsSandboxProvider,
    AzureSandboxGroupControlPlane,
    type AzureSandboxesConfig,
} from './AzureContainerAppsSandboxProvider';
import { DockerSandboxProvider } from './DockerSandboxProvider';
import { E2bSandboxProvider } from './E2bSandboxProvider';
import {
    AwsMicrovmControlPlane,
    LambdaMicroVmSandboxProvider,
    type LambdaMicroVmConfig,
} from './LambdaMicroVmSandboxProvider';
import { SandboxManager, type SandboxRegistryStore } from './SandboxManager';
import { S3SnapshotStore, type SnapshotStore } from './SnapshotStore';
import { type SandboxLogger, type SandboxProvider } from './types';

export * from './AzureContainerAppsSandboxProvider';
export * from './errors';
export * from './SandboxManager';
export * from './SnapshotStore';
export * from './types';

export type SandboxProviderKind =
    | 'e2b'
    | 'docker'
    | 'lambda-microvm'
    | 'azure-sandboxes';

/** Static, non-per-sandbox config the Lambda MicroVMs provider needs. */
export interface LambdaMicroVmProviderConfig extends LambdaMicroVmConfig {
    region: string;
}

/**
 * Provider-construction options, one variant per `SANDBOX_PROVIDER`. Keyed on
 * `provider` so each backend only carries the config it actually uses: invalid
 * combinations (a Docker image without a snapshot store, Lambda config on the
 * E2B path, …) are unrepresentable rather than "ignored otherwise".
 */
export type CreateSandboxProviderOptions =
    | {
          provider: 'e2b';
          e2bApiKey: string | null;
          logger: SandboxLogger;
      }
    | {
          provider: 'docker';
          dockerImage: string;
          /** Backing store for object-store snapshots — Docker-only. */
          snapshotStore: SnapshotStore;
          logger: SandboxLogger;
      }
    | {
          provider: 'lambda-microvm';
          lambdaMicroVm: LambdaMicroVmProviderConfig;
          logger: SandboxLogger;
      }
    | {
          provider: 'azure-sandboxes';
          azureSandboxes: AzureSandboxesConfig;
          logger: SandboxLogger;
      };

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
        case 'azure-sandboxes': {
            const config = options.azureSandboxes;
            if (!config.sandboxGroup) {
                throw new MissingConfigError(
                    'Azure Sandboxes is not configured (AZURE_SANDBOXES_*)',
                );
            }
            // `DefaultAzureCredential` resolves the workload identity in production
            // (the SandboxGroup Data Owner role) and env/CLI creds in dev.
            const controlPlane = new AzureSandboxGroupControlPlane(
                new DefaultAzureCredential(),
                config,
                options.logger,
            );
            return new AzureContainerAppsSandboxProvider(
                controlPlane,
                config,
                options.logger,
            );
        }
        default:
            return assertUnreachable(
                options,
                `Unknown SANDBOX_PROVIDER: ${
                    (options as { provider: string }).provider
                }`,
            );
    }
};

/** The two sandboxed features; each launches from its own image/template. */
export type SandboxFeature = 'data-app' | 'ai-writeback';

/** A configured lifecycle surface plus the image/template it launches from. */
export interface SandboxRuntime {
    manager: SandboxManager;
    templateRef: string;
}

export interface ResolveSandboxRuntimeOptions {
    lightdashConfig: LightdashConfig;
    feature: SandboxFeature;
    registryModel: SandboxRegistryStore;
    logger: SandboxLogger;
}

/** E2B treats `name` and `name:default` interchangeably, so an empty tag is fine. */
const composeE2bTemplateRef = (name: string, tag: string): string =>
    tag ? `${name}:${tag}` : name;

/** Resolve the image/template the active provider launches `feature` from. */
const resolveTemplateRef = (
    appRuntime: LightdashConfig['appRuntime'],
    feature: SandboxFeature,
): string => {
    const isDataApp = feature === 'data-app';
    switch (appRuntime.sandboxProvider) {
        case 'docker':
            return isDataApp
                ? appRuntime.sandboxDockerImage
                : appRuntime.sandboxAiWritebackDockerImage;
        case 'lambda-microvm': {
            const arn = isDataApp
                ? appRuntime.lambdaMicroVmDataAppImageArn
                : appRuntime.lambdaMicroVmAiWritebackImageArn;
            if (!arn) {
                throw new MissingConfigError(
                    isDataApp
                        ? 'Lambda MicroVM data-app image ARN is not configured (LAMBDA_MICROVM_DATA_APP_IMAGE_ARN)'
                        : 'Lambda MicroVM AI writeback image ARN is not configured (LAMBDA_MICROVM_AI_WRITEBACK_IMAGE_ARN)',
                );
            }
            return arn;
        }
        case 'azure-sandboxes': {
            const diskImage = isDataApp
                ? appRuntime.azureSandboxesDataAppDiskImage
                : appRuntime.azureSandboxesAiWritebackDiskImage;
            if (!diskImage) {
                throw new MissingConfigError(
                    isDataApp
                        ? 'Azure data-app sandbox disk image is not configured (AZURE_SANDBOXES_DATA_APP_DISK_IMAGE)'
                        : 'Azure AI writeback sandbox disk image is not configured (AZURE_SANDBOXES_AI_WRITEBACK_DISK_IMAGE)',
                );
            }
            return diskImage;
        }
        case 'e2b':
            return isDataApp
                ? composeE2bTemplateRef(
                      appRuntime.e2bTemplateName,
                      appRuntime.e2bTemplateTag,
                  )
                : composeE2bTemplateRef(
                      appRuntime.e2bAiWritebackTemplateName,
                      appRuntime.e2bAiWritebackTemplateTag,
                  );
        default:
            return assertUnreachable(
                appRuntime.sandboxProvider,
                `Unknown SANDBOX_PROVIDER: ${
                    appRuntime.sandboxProvider as string
                }`,
            );
    }
};

/**
 * Assemble the Azure Sandboxes config for `feature`. One sandbox group + disk
 * image per feature (like the split Docker images / Lambda ARNs), sharing the
 * subscription/region settings.
 */
const buildAzureSandboxesConfig = (
    appRuntime: LightdashConfig['appRuntime'],
    feature: SandboxFeature,
): AzureSandboxesConfig => {
    const { azureSandboxes, sandboxIdleTimeoutMs } = appRuntime;
    const isDataApp = feature === 'data-app';
    const sandboxGroup = isDataApp
        ? appRuntime.azureSandboxesDataAppGroup
        : appRuntime.azureSandboxesAiWritebackGroup;
    if (
        !azureSandboxes.subscriptionId ||
        !azureSandboxes.resourceGroup ||
        !sandboxGroup
    ) {
        throw new MissingConfigError(
            isDataApp
                ? 'Azure Sandboxes is not configured (AZURE_SANDBOXES_SUBSCRIPTION_ID / AZURE_SANDBOXES_RESOURCE_GROUP / AZURE_SANDBOXES_DATA_APP_GROUP)'
                : 'Azure Sandboxes is not configured (AZURE_SANDBOXES_SUBSCRIPTION_ID / AZURE_SANDBOXES_RESOURCE_GROUP / AZURE_SANDBOXES_AI_WRITEBACK_GROUP)',
        );
    }
    return {
        subscriptionId: azureSandboxes.subscriptionId,
        resourceGroup: azureSandboxes.resourceGroup,
        region: azureSandboxes.region,
        sandboxGroup,
        apiVersion: azureSandboxes.apiVersion,
        tokenScope: azureSandboxes.tokenScope,
        resourceTier: azureSandboxes.resourceTier,
        autoSuspendIdleSeconds: Math.floor(sandboxIdleTimeoutMs / 1000),
    };
};

/** Assemble the per-provider construction options for `feature`. */
const buildProviderOptions = (
    lightdashConfig: LightdashConfig,
    feature: SandboxFeature,
    logger: SandboxLogger,
): CreateSandboxProviderOptions => {
    const { appRuntime } = lightdashConfig;
    switch (appRuntime.sandboxProvider) {
        case 'e2b':
            return {
                provider: 'e2b',
                e2bApiKey: appRuntime.e2bApiKey,
                logger,
            };
        case 'docker':
            return {
                provider: 'docker',
                dockerImage:
                    feature === 'data-app'
                        ? appRuntime.sandboxDockerImage
                        : appRuntime.sandboxAiWritebackDockerImage,
                // Object-store snapshots are Docker-only; native-pause providers
                // never touch S3, so a client is constructed only on this path.
                snapshotStore: new S3SnapshotStore({ lightdashConfig }),
                logger,
            };
        case 'lambda-microvm':
            return {
                provider: 'lambda-microvm',
                lambdaMicroVm: appRuntime.lambdaMicroVm,
                logger,
            };
        case 'azure-sandboxes':
            return {
                provider: 'azure-sandboxes',
                azureSandboxes: buildAzureSandboxesConfig(appRuntime, feature),
                logger,
            };
        default:
            return assertUnreachable(
                appRuntime.sandboxProvider,
                `Unknown SANDBOX_PROVIDER: ${
                    appRuntime.sandboxProvider as string
                }`,
            );
    }
};

/**
 * Build the {@link SandboxRuntime} (a {@link SandboxManager} + the feature's
 * image/template ref) for the provider selected by `SANDBOX_PROVIDER`. The
 * single entry point feature services use to get a lifecycle surface —
 * snapshot-store construction is hidden inside, so callers never branch on the
 * provider or touch S3.
 */
export const resolveSandboxRuntime = ({
    lightdashConfig,
    feature,
    registryModel,
    logger,
}: ResolveSandboxRuntimeOptions): SandboxRuntime => {
    const { appRuntime } = lightdashConfig;
    const provider = createSandboxProvider(
        buildProviderOptions(lightdashConfig, feature, logger),
    );
    const manager = new SandboxManager({
        provider,
        providerKind: appRuntime.sandboxProvider,
        registryModel,
        logger,
    });
    return { manager, templateRef: resolveTemplateRef(appRuntime, feature) };
};
