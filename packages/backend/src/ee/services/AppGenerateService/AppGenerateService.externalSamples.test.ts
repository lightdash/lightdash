// e2b and ai are ESM-only packages that cannot be required by Jest/CJS.
// Mock them before importing AppGenerateService.
import { FeatureFlags } from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

jest.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
jest.mock('ai', () => ({
    generateObject: jest.fn(),
}));

type PrivateWithSamples = {
    writeExternalConnectionSamples: (
        sandbox: unknown,
        appUuid: string,
        links: unknown[],
    ) => Promise<string>;
    resolveExternalConnectionSamples: (appId: string) => Promise<unknown[]>;
    logger: { info: jest.Mock };
};

function buildService(flagEnabled = true) {
    // Build a minimal AppGenerateService with only the deps needed for the
    // private writeExternalConnectionSamples method (which uses only
    // this.logger and the sandbox argument). All other deps are stubbed out.
    const featureFlagModel = {
        get: jest
            .fn()
            .mockImplementation(
                ({ featureFlagId }: { featureFlagId: string }) => {
                    if (
                        featureFlagId ===
                        FeatureFlags.EnableDataAppExternalAccess
                    ) {
                        return Promise.resolve({
                            id: featureFlagId,
                            enabled: flagEnabled,
                        });
                    }
                    return Promise.resolve({
                        id: featureFlagId,
                        enabled: true,
                    });
                },
            ),
    };
    return {
        service: new AppGenerateService({
            lightdashConfig: {} as never,
            analytics: {} as never,
            analyticsModel: {} as never,
            catalogModel: {} as never,
            appModel: {} as never,
            featureFlagModel: featureFlagModel as never,
            organizationDesignModel: {} as never,
            pinnedListModel: {} as never,
            projectModel: {} as never,
            spaceModel: {} as never,
            schedulerClient: {} as never,
            savedChartService: {} as never,
            spacePermissionService: {} as never,
            dashboardService: {} as never,
            projectService: {} as never,
            promoteService: {} as never,
            externalConnectionModel: {} as never,
        }) as unknown as PrivateWithSamples,
        featureFlagModel,
    };
}

const makeSandbox = () => ({
    commands: {
        run: jest.fn().mockResolvedValue({ exitCode: 0 }),
    },
    files: {
        write: jest.fn().mockResolvedValue(undefined),
    },
});

describe('AppGenerateService.writeExternalConnectionSamples', () => {
    it('writes a json file + one prompt line per connection with a sample', async () => {
        const sandbox = makeSandbox();
        const links = [
            {
                alias: 'weather',
                connectionUuid: 'c1',
                sample: { temp: 21, city: 'Berlin' },
            },
            {
                alias: 'crm',
                connectionUuid: 'c2',
                sample: [{ id: 1 }, { id: 2 }],
            },
        ];
        const { service } = buildService();

        const block = await service.writeExternalConnectionSamples(
            sandbox,
            'app-1',
            links,
        );

        expect(sandbox.files.write).toHaveBeenCalledWith(
            '/tmp/external-data/weather.json',
            JSON.stringify({ temp: 21, city: 'Berlin' }, null, 2),
        );
        expect(sandbox.files.write).toHaveBeenCalledWith(
            '/tmp/external-data/crm.json',
            JSON.stringify([{ id: 1 }, { id: 2 }], null, 2),
        );
        expect(block).toContain('/tmp/external-data/weather.json');
        expect(block).toContain('/tmp/external-data/crm.json');
        expect(block).toContain('weather');
        expect(block).toContain('crm');
    });

    it('skips connections that have no sample and returns empty string when none have samples', async () => {
        const sandbox = makeSandbox();
        const links = [
            { alias: 'weather', connectionUuid: 'c1', sample: null },
            { alias: 'crm', connectionUuid: 'c2', sample: undefined },
        ];
        const { service } = buildService();

        const block = await service.writeExternalConnectionSamples(
            sandbox,
            'app-1',
            links,
        );

        expect(sandbox.files.write).not.toHaveBeenCalled();
        expect(block).toBe('');
    });

    it('does not mkdir or write when there are no linked connections', async () => {
        const sandbox = makeSandbox();
        const { service } = buildService();

        const block = await service.writeExternalConnectionSamples(
            sandbox,
            'app-1',
            [],
        );

        expect(sandbox.commands.run).not.toHaveBeenCalled();
        expect(sandbox.files.write).not.toHaveBeenCalled();
        expect(block).toBe('');
    });
});

describe('AppGenerateService pipeline external-access flag gate', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('skips resolveExternalConnectionSamples and writeExternalConnectionSamples when the flag is OFF', async () => {
        const sandbox = makeSandbox();
        const { service } = buildService(false);

        const resolveSpy = jest
            .spyOn(
                service as unknown as PrivateWithSamples,
                'resolveExternalConnectionSamples',
            )
            .mockResolvedValue([
                {
                    alias: 'weather',
                    connectionUuid: 'c1',
                    sample: { temp: 21 },
                },
            ]);
        const writeSpy = jest.spyOn(
            service as unknown as PrivateWithSamples,
            'writeExternalConnectionSamples',
        );

        // Call writeCatalogAndPrompt via a cast — it checks the flag before resolving/writing.
        // We stub catalog and prompt-file writes to avoid real I/O.
        const privateService = service as unknown as {
            writeCatalogAndPrompt: (
                sandbox: unknown,
                appUuid: string,
                projectUuid: string,
                prompt: string,
                imageIds: undefined,
                s3Client: unknown,
                bucket: string,
                chartReferences: undefined,
                template: undefined,
                user: { userUuid: string; organizationUuid: string },
            ) => Promise<unknown>;
            catalogModel: { getCatalogItemsSummary: jest.Mock };
        };
        privateService.catalogModel = {
            getCatalogItemsSummary: jest.fn().mockResolvedValue([]),
        };

        await privateService.writeCatalogAndPrompt(
            sandbox,
            'app-1',
            'project-1',
            'build me an app',
            undefined,
            {} as never,
            'bucket',
            undefined,
            undefined,
            { userUuid: 'user-1', organizationUuid: 'org-1' },
        );

        expect(resolveSpy).not.toHaveBeenCalled();
        expect(writeSpy).not.toHaveBeenCalled();
        expect(sandbox.files.write).not.toHaveBeenCalledWith(
            expect.stringContaining('/tmp/external-data/'),
            expect.anything(),
        );
    });

    it('calls resolveExternalConnectionSamples when the flag is ON', async () => {
        const sandbox = makeSandbox();
        const { service } = buildService(true);

        const resolveSpy = jest
            .spyOn(
                service as unknown as PrivateWithSamples,
                'resolveExternalConnectionSamples',
            )
            .mockResolvedValue([]);

        const privateService = service as unknown as {
            writeCatalogAndPrompt: (
                sandbox: unknown,
                appUuid: string,
                projectUuid: string,
                prompt: string,
                imageIds: undefined,
                s3Client: unknown,
                bucket: string,
                chartReferences: undefined,
                template: undefined,
                user: { userUuid: string; organizationUuid: string },
            ) => Promise<unknown>;
            catalogModel: { getCatalogItemsSummary: jest.Mock };
        };
        privateService.catalogModel = {
            getCatalogItemsSummary: jest.fn().mockResolvedValue([]),
        };

        await privateService.writeCatalogAndPrompt(
            sandbox,
            'app-1',
            'project-1',
            'build me an app',
            undefined,
            {} as never,
            'bucket',
            undefined,
            undefined,
            { userUuid: 'user-1', organizationUuid: 'org-1' },
        );

        expect(resolveSpy).toHaveBeenCalledWith('app-1');
    });
});
