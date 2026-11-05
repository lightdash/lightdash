import { MissingConfigError } from '@lightdash/common';
import { createSandboxProvider } from '../ee/services/SandboxRuntime';
import {
    getAppRuntimeConfigError,
    isAppRuntimeConfigured,
} from './appRuntimeAvailability';
import {
    lightdashConfigMock,
    lightdashConfigWithAppRuntimeMock,
} from './lightdashConfig.mock';
import { type LightdashConfig } from './parseConfig';

const configured = lightdashConfigWithAppRuntimeMock;

const withAppRuntime = (
    appRuntime: Partial<LightdashConfig['appRuntime']>,
): LightdashConfig => ({
    ...configured,
    appRuntime: { ...configured.appRuntime, ...appRuntime },
});

describe('isAppRuntimeConfigured', () => {
    it('is true when a sandbox provider is configured', () => {
        expect(isAppRuntimeConfigured(configured)).toBe(true);
    });

    it('is false for the default unconfigured instance', () => {
        expect(isAppRuntimeConfigured(lightdashConfigMock)).toBe(false);
    });

    it.each([
        ['e2b', { sandboxProvider: 'e2b', e2bApiKey: null }],
        [
            'lambda-microvm',
            {
                sandboxProvider: 'lambda-microvm',
                lambdaMicroVmDataAppImageArn: null,
            },
        ],
        [
            'azure-sandboxes',
            {
                sandboxProvider: 'azure-sandboxes',
                azureSandboxes: {
                    ...configured.appRuntime.azureSandboxes,
                    subscriptionId: 'sub',
                    resourceGroup: 'rg',
                },
                azureSandboxesDataAppGroup: 'group',
                azureSandboxesDataAppDiskImage: null,
            },
        ],
        [
            'gcp-cloud-run',
            {
                sandboxProvider: 'gcp-cloud-run',
                gcpCloudRun: { sandboxUrl: 'https://gw', sandboxSecret: null },
            },
        ],
    ] as const)(
        'requires the %s data-app image or credentials',
        (_provider, appRuntime) => {
            expect(isAppRuntimeConfigured(withAppRuntime(appRuntime))).toBe(
                false,
            );
        },
    );

    it.each([
        ['e2b', { sandboxProvider: 'e2b', e2bApiKey: 'key' }],
        [
            'lambda-microvm',
            {
                sandboxProvider: 'lambda-microvm',
                lambdaMicroVmDataAppImageArn: 'arn:image',
                lambdaMicroVm: {
                    ...configured.appRuntime.lambdaMicroVm,
                    ingressConnectorArn: 'arn:in',
                    egressConnectorArn: 'arn:out',
                },
            },
        ],
        [
            'gcp-cloud-run',
            {
                sandboxProvider: 'gcp-cloud-run',
                gcpCloudRun: { sandboxUrl: 'https://gw', sandboxSecret: 's' },
            },
        ],
    ] as const)('accepts a configured %s provider', (_provider, appRuntime) => {
        expect(isAppRuntimeConfigured(withAppRuntime(appRuntime))).toBe(true);
    });

    it.each(['claude', 'codex'] as const)(
        'does not need an instance coding agent key for %s',
        (dataAppCodingAgent) => {
            const withoutKeys: LightdashConfig = {
                ...withAppRuntime({ dataAppCodingAgent }),
                ai: {
                    ...configured.ai,
                    copilot: { ...configured.ai.copilot, providers: {} },
                },
            };
            expect(isAppRuntimeConfigured(withoutKeys)).toBe(true);
        },
    );
});

describe('build paths share the availability messages', () => {
    const noLambdaConnectors = {
        ...configured.appRuntime.lambdaMicroVm,
        ingressConnectorArn: '',
        egressConnectorArn: '',
    };

    it.each([
        [
            'e2b',
            withAppRuntime({ sandboxProvider: 'e2b', e2bApiKey: null }),
            { e2bApiKey: null },
        ],
        [
            'lambda-microvm',
            withAppRuntime({
                sandboxProvider: 'lambda-microvm',
                lambdaMicroVmDataAppImageArn: 'arn:image',
                lambdaMicroVm: noLambdaConnectors,
            }),
            { lambdaMicroVm: noLambdaConnectors },
        ],
        [
            'gcp-cloud-run',
            withAppRuntime({
                sandboxProvider: 'gcp-cloud-run',
                gcpCloudRun: { sandboxUrl: null, sandboxSecret: null },
            }),
            { gcpCloudRun: null },
        ],
    ] as const)(
        'reports the same %s error the sandbox provider throws',
        (provider, config, options) => {
            expect(() =>
                createSandboxProvider({
                    provider,
                    e2bApiKey: null,
                    dockerImage: 'image',
                    lambdaMicroVm: null,
                    azureSandboxes: null,
                    gcpCloudRun: null,
                    snapshotStore: null,
                    logger: {
                        info: vi.fn(),
                        warn: vi.fn(),
                        debug: vi.fn(),
                        error: vi.fn(),
                    },
                    ...options,
                } as never),
            ).toThrow(
                new MissingConfigError(getAppRuntimeConfigError(config) ?? ''),
            );
        },
    );
});
