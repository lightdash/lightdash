// e2b and ai are ESM-only packages that cannot be required by Jest/CJS.
// Mock them before importing AppGenerateService.
import {
    ForbiddenError,
    ParameterError,
    type ExternalConnectionSample,
} from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

type AppExternalConnectionDoc = {
    alias: string;
    origin: string;
    allowedMethods: string[];
    allowedPathPrefixes: string[];
    samples: ExternalConnectionSample[];
};

type PrivateWithSamples = {
    writeExternalConnectionSamples: (
        sandbox: unknown,
        appUuid: string,
        docs: AppExternalConnectionDoc[],
    ) => Promise<string>;
    resolveExternalConnectionSamples: (
        appId: string,
    ) => Promise<AppExternalConnectionDoc[]>;
    logger: { info: import('vitest').Mock };
};

type PrivateWithLink = {
    linkExternalConnections: (
        user: unknown,
        projectUuid: string,
        appId: string,
        externalConnections:
            | Array<{ externalConnectionUuid: string; alias: string }>
            | undefined,
    ) => Promise<unknown>;
};

function buildService() {
    // Build a minimal AppGenerateService with only the deps needed for the
    // private writeExternalConnectionSamples method (which uses only
    // this.logger and the sandbox argument). All other deps are stubbed out.
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
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
            projectParametersModel: {} as never,
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
        run: vi.fn().mockResolvedValue({ exitCode: 0 }),
    },
    files: {
        write: vi.fn().mockResolvedValue(undefined),
    },
});

const makeSample = (alias: string, n: number): ExternalConnectionSample => ({
    sampleUuid: `${alias}-sample-${n}`,
    externalConnectionUuid: `conn-${alias}`,
    label: `${alias} example ${n}`,
    request: { method: 'GET', path: `/v1/${alias}` },
    response: { result: alias, n },
    createdAt: new Date('2024-01-01'),
});

describe('AppGenerateService.writeExternalConnectionSamples', () => {
    it('writes a JSON API-doc per connection and builds a prompt block', async () => {
        const sandbox = makeSandbox();
        const docs: AppExternalConnectionDoc[] = [
            {
                alias: 'weather',
                origin: 'https://api.weather.test',
                allowedMethods: ['GET'],
                allowedPathPrefixes: ['/v1/'],
                samples: [makeSample('weather', 1)],
            },
            {
                alias: 'crm',
                origin: 'https://api.crm.test',
                allowedMethods: ['GET', 'POST'],
                allowedPathPrefixes: ['/api/'],
                samples: [makeSample('crm', 1), makeSample('crm', 2)],
            },
        ];
        const { service } = buildService();

        const block = await service.writeExternalConnectionSamples(
            sandbox,
            'app-1',
            docs,
        );

        // Both files written
        expect(sandbox.files.write).toHaveBeenCalledWith(
            '/tmp/external-data/weather.json',
            expect.any(String),
        );
        expect(sandbox.files.write).toHaveBeenCalledWith(
            '/tmp/external-data/crm.json',
            expect.any(String),
        );

        // Weather file contains expected fields
        const weatherCall = (
            sandbox.files.write as import('vitest').Mock
        ).mock.calls.find(
            ([path]) => path === '/tmp/external-data/weather.json',
        );
        if (!weatherCall) throw new Error('Expected weather sample write');
        const weatherDoc = JSON.parse(weatherCall[1]);
        expect(weatherDoc.howToCall).toContain('weather');
        expect(weatherDoc.howToCall).toContain('externalFetch');
        // The doc must spell out origin + the full request URL so the agent
        // never guesses that the path is relative to the prefix.
        expect(weatherDoc.origin).toBe('https://api.weather.test');
        expect(weatherDoc.requestUrl).toContain('https://api.weather.test');
        expect(weatherDoc.allowedMethods).toEqual(['GET']);
        expect(weatherDoc.allowedPathPrefixes).toEqual(['/v1/']);
        expect(weatherDoc.samples).toHaveLength(1);
        expect(weatherDoc.samples[0].request.method).toBe('GET');

        // CRM file has 2 samples
        const crmCall = (
            sandbox.files.write as import('vitest').Mock
        ).mock.calls.find(([path]) => path === '/tmp/external-data/crm.json');
        if (!crmCall) throw new Error('Expected CRM sample write');
        const crmDoc = JSON.parse(crmCall[1]);
        expect(crmDoc.allowedMethods).toEqual(['GET', 'POST']);
        expect(crmDoc.samples).toHaveLength(2);

        // Prompt block mentions both aliases and method info
        expect(block).toContain('/tmp/external-data/weather.json');
        expect(block).toContain('/tmp/external-data/crm.json');
        expect(block).toContain('weather');
        expect(block).toContain('crm');
        expect(block).toContain('GET');
    });

    it('writes a file even for connections with no samples', async () => {
        const sandbox = makeSandbox();
        const docs: AppExternalConnectionDoc[] = [
            {
                alias: 'weather',
                origin: 'https://api.weather.test',
                allowedMethods: ['GET'],
                allowedPathPrefixes: ['/v1/'],
                samples: [],
            },
        ];
        const { service } = buildService();

        const block = await service.writeExternalConnectionSamples(
            sandbox,
            'app-1',
            docs,
        );

        expect(sandbox.files.write).toHaveBeenCalledWith(
            '/tmp/external-data/weather.json',
            expect.any(String),
        );
        const call = (sandbox.files.write as import('vitest').Mock).mock
            .calls[0];
        const written = JSON.parse(call[1]);
        expect(written.howToCall).toContain('externalFetch');
        expect(written.allowedMethods).toEqual(['GET']);
        expect(written.samples).toEqual([]);
        expect(block).toContain('/tmp/external-data/weather.json');
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

describe('AppGenerateService pipeline external connection samples', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('calls resolveExternalConnectionSamples during the catalog stage', async () => {
        const sandbox = makeSandbox();
        const { service } = buildService();

        const resolveSpy = vi
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
            ) => Promise<unknown>;
            projectModel: { getAllExploresFromCache: import('vitest').Mock };
            projectParametersModel: { find: import('vitest').Mock };
        };
        privateService.projectModel = {
            getAllExploresFromCache: vi.fn().mockResolvedValue({}),
        };
        privateService.projectParametersModel = {
            find: vi.fn().mockResolvedValue([]),
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
        );

        expect(resolveSpy).toHaveBeenCalledWith('app-1');
    });
});

describe('AppGenerateService.linkExternalConnections', () => {
    const sameProjectConn = {
        projectUuid: 'proj-1',
        organizationUuid: 'org-1',
        name: 'Weather API',
    };
    const ref = [{ externalConnectionUuid: 'c1', alias: 'weather' }];
    const user = { userUuid: 'u1', organizationUuid: 'org-1' };

    function setup(opts: { connection?: unknown; canManage: boolean }) {
        const { service } = buildService();
        const linkToApp = vi.fn().mockResolvedValue(undefined);
        (
            service as unknown as { externalConnectionModel: unknown }
        ).externalConnectionModel = {
            findByUuid: vi
                .fn()
                .mockResolvedValue(opts.connection ?? sameProjectConn),
            linkToApp,
        };
        vi.spyOn(
            service as unknown as { createAuditedAbility: () => unknown },
            'createAuditedAbility',
        ).mockReturnValue({
            can: () => opts.canManage,
            cannot: () => !opts.canManage,
        });
        return { service: service as unknown as PrivateWithLink, linkToApp };
    }

    it('throws ForbiddenError and does not link when the user cannot manage the connection', async () => {
        const { service, linkToApp } = setup({ canManage: false });
        await expect(
            service.linkExternalConnections(user, 'proj-1', 'app-1', ref),
        ).rejects.toThrow(ForbiddenError);
        expect(linkToApp).not.toHaveBeenCalled();
    });

    it('rejects an alias outside the safe charset before persisting', async () => {
        const { service, linkToApp } = setup({ canManage: true });
        await expect(
            service.linkExternalConnections(user, 'proj-1', 'app-1', [
                { externalConnectionUuid: 'c1', alias: '../../etc/passwd' },
            ]),
        ).rejects.toThrow(ParameterError);
        expect(linkToApp).not.toHaveBeenCalled();
    });

    it('links when the user can manage and the alias is valid', async () => {
        const { service, linkToApp } = setup({ canManage: true });
        await service.linkExternalConnections(user, 'proj-1', 'app-1', ref);
        expect(linkToApp).toHaveBeenCalledWith('app-1', 'c1', 'weather');
    });

    it('skips (does not link) a connection from another project', async () => {
        const { service, linkToApp } = setup({
            canManage: true,
            connection: { projectUuid: 'other', organizationUuid: 'org-1' },
        });
        await service.linkExternalConnections(user, 'proj-1', 'app-1', ref);
        expect(linkToApp).not.toHaveBeenCalled();
    });
});
