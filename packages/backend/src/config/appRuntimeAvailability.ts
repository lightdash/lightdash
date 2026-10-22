import { assertUnreachable } from '@lightdash/common';
import { type LightdashConfig } from './parseConfig';

export type AppRuntimeAvailabilityConfig = {
    appRuntime: Pick<
        LightdashConfig['appRuntime'],
        | 'sandboxProvider'
        | 'e2bApiKey'
        | 'lambdaMicroVm'
        | 'lambdaMicroVmDataAppImageArn'
        | 'azureSandboxes'
        | 'azureSandboxesDataAppGroup'
        | 'azureSandboxesDataAppDiskImage'
        | 'gcpCloudRun'
    >;
};

type AppRuntime = AppRuntimeAvailabilityConfig['appRuntime'];

/** Shared with the build paths that throw, so availability and build errors stay in step. */
export const AppRuntimeConfigErrors = {
    s3: 'S3 is not configured for app runtime',
    e2bApiKey: 'E2B API key is not configured (E2B_API_KEY)',
    lambdaMicroVmDataAppImage:
        'Lambda MicroVM data-app image ARN is not configured (LAMBDA_MICROVM_DATA_APP_IMAGE_ARN)',
    lambdaMicroVmConnectors:
        'Lambda MicroVMs ingress/egress connector ARNs are not configured',
    azureSandboxesDataAppGroup:
        'Azure Sandboxes is not configured (AZURE_SANDBOXES_SUBSCRIPTION_ID / AZURE_SANDBOXES_RESOURCE_GROUP / AZURE_SANDBOXES_DATA_APP_GROUP)',
    azureSandboxesDataAppDiskImage:
        'Azure data-app sandbox disk image is not configured (AZURE_SANDBOXES_DATA_APP_DISK_IMAGE)',
    gcpCloudRun:
        'GCP Cloud Run sandboxes are not configured (GCP_CLOUD_RUN_SANDBOX_URL / GCP_CLOUD_RUN_SANDBOX_SECRET)',
} as const;

/** The data-app Azure sandbox group settings, or null when any is missing. */
export const getDataAppAzureSandboxGroup = (
    appRuntime: AppRuntime,
): {
    subscriptionId: string;
    resourceGroup: string;
    sandboxGroup: string;
} | null => {
    const { subscriptionId, resourceGroup } = appRuntime.azureSandboxes;
    const sandboxGroup = appRuntime.azureSandboxesDataAppGroup;
    return subscriptionId && resourceGroup && sandboxGroup
        ? { subscriptionId, resourceGroup, sandboxGroup }
        : null;
};

/** The data-app Cloud Run gateway URL and secret, or null when either is missing. */
export const getDataAppCloudRunGateway = (
    appRuntime: AppRuntime,
): { sandboxUrl: string; sandboxSecret: string } | null => {
    const { sandboxUrl, sandboxSecret } = appRuntime.gcpCloudRun;
    return sandboxUrl && sandboxSecret ? { sandboxUrl, sandboxSecret } : null;
};

/** What the data-app sandbox provider still needs before it can launch, or null. */
export const getDataAppSandboxConfigError = (
    appRuntime: AppRuntime,
): string | null => {
    const { sandboxProvider } = appRuntime;
    switch (sandboxProvider) {
        case 'e2b':
            return appRuntime.e2bApiKey
                ? null
                : AppRuntimeConfigErrors.e2bApiKey;
        case 'docker':
            return null;
        case 'lambda-microvm':
            if (!appRuntime.lambdaMicroVmDataAppImageArn) {
                return AppRuntimeConfigErrors.lambdaMicroVmDataAppImage;
            }
            if (
                !appRuntime.lambdaMicroVm.ingressConnectorArn ||
                !appRuntime.lambdaMicroVm.egressConnectorArn
            ) {
                return AppRuntimeConfigErrors.lambdaMicroVmConnectors;
            }
            return null;
        case 'azure-sandboxes':
            if (!getDataAppAzureSandboxGroup(appRuntime)) {
                return AppRuntimeConfigErrors.azureSandboxesDataAppGroup;
            }
            if (!appRuntime.azureSandboxesDataAppDiskImage) {
                return AppRuntimeConfigErrors.azureSandboxesDataAppDiskImage;
            }
            return null;
        case 'gcp-cloud-run':
            return getDataAppCloudRunGateway(appRuntime)
                ? null
                : AppRuntimeConfigErrors.gcpCloudRun;
        default:
            return assertUnreachable(
                sandboxProvider,
                `Unknown SANDBOX_PROVIDER: ${sandboxProvider as string}`,
            );
    }
};

/**
 * What the configured sandbox provider still needs before builds can run, or
 * null. The apps bucket falls back to the required base S3 bucket, and the
 * coding agent key is resolved per organization, so neither is checked here.
 */
export const getAppRuntimeConfigError = (
    config: AppRuntimeAvailabilityConfig,
): string | null => getDataAppSandboxConfigError(config.appRuntime);

export const isAppRuntimeConfigured = (
    config: AppRuntimeAvailabilityConfig,
): boolean => getAppRuntimeConfigError(config) === null;
