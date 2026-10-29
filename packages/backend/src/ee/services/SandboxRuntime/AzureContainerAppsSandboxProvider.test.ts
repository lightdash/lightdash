import { AzureContainerAppsSandboxProvider } from './AzureContainerAppsSandboxProvider';

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const config = {
    subscriptionId: 'sub',
    resourceGroup: 'rg',
    region: 'eastus2',
    sandboxGroup: 'python',
    apiVersion: '2026-02-01-preview',
    tokenScope: 'scope',
    resourceTier: 'M',
    autoSuspendIdleSeconds: 60,
};

const spec = {
    templateRef: 'disk-id',
    timeoutMs: 1_000,
    egress: { allow: [] },
};

describe('AzureContainerAppsSandboxProvider.create', () => {
    it('deletes a sandbox that fails to reach Running so the allocation is not leaked', async () => {
        const controlPlane = {
            createSandbox: vi
                .fn()
                .mockResolvedValue({ sandboxId: 'sb-1', state: 'Creating' }),
            getSandbox: vi.fn().mockRejectedValue(new Error('status 500')),
            suspendSandbox: vi.fn(),
            resumeSandbox: vi.fn(),
            deleteSandbox: vi.fn().mockResolvedValue(undefined),
            dataPlaneBaseUrl: vi
                .fn()
                .mockReturnValue('https://example.test/sb-1'),
            getAccessToken: vi.fn().mockResolvedValue('token'),
        };
        const provider = new AzureContainerAppsSandboxProvider(
            controlPlane,
            config,
            logger,
        );

        await expect(provider.create(spec)).rejects.toThrow('status 500');
        expect(controlPlane.deleteSandbox).toHaveBeenCalledWith('sb-1');
    });
});
