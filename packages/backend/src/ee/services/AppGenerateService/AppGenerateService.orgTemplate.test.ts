import {
    defineUserAbility,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    type SessionUser,
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

const ORG_UUID = 'org-1';
const USER_UUID = 'user-1';

const TEMPLATE = {
    templateUuid: 'tpl-1',
    organizationUuid: ORG_UUID,
    slug: 'metric-forecaster',
    name: 'Metric Forecaster',
    description: 'x',
    category: 'Forecasting',
    questions: [],
    kind: 'seeded',
    fileCount: 3,
    createdByUserUuid: 'someone',
    createdAt: new Date(),
    updatedAt: new Date(),
};

const buildUser = (role: OrganizationMemberRole): SessionUser =>
    ({
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
        role,
        ability: defineUserAbility(
            {
                role,
                organizationUuid: ORG_UUID,
                userUuid: USER_UUID,
                roleUuid: undefined,
            },
            [],
        ),
    }) as unknown as SessionUser;

const buildService = ({
    flagEnabled = true,
    template = TEMPLATE as typeof TEMPLATE | null,
    codingAgent = 'claude' as 'claude' | 'codex',
    guardrails = 'Keep the methodology.' as string | null,
} = {}) =>
    new AppGenerateService({
        dataAppTemplateService: {
            // findForBuild resolves undefined for an unknown slug
            findForBuild: vi.fn().mockResolvedValue(template ?? undefined),
            getSourceFiles: vi.fn().mockImplementation(async () => {
                if (!template) throw new NotFoundError('gone');
                return {
                    template,
                    files: [
                        { filename: 'src/App.tsx', contents: 'export {}' },
                        { filename: 'src/template.json', contents: '{}' },
                        { filename: 'AGENTS.md', contents: guardrails ?? '' },
                    ],
                    guardrails,
                };
            }),
            getGuardrails: vi
                .fn()
                .mockImplementation(async () =>
                    template ? { template, guardrails } : undefined,
                ),
        } as never,
        lightdashConfig: {
            appRuntime: { dataAppCodingAgent: codingAgent },
        } as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: {} as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: flagEnabled }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {} as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
    });

const resolve = (service: AppGenerateService, user: SessionUser) =>
    (
        service as unknown as {
            resolveOrgTemplateForBuild: (
                u: SessionUser,
                org: string,
                slug: string,
            ) => Promise<typeof TEMPLATE>;
        }
    ).resolveOrgTemplateForBuild(user, ORG_UUID, 'metric-forecaster');

describe('AppGenerateService: building from an organization template', () => {
    it('resolves the template for a user holding create:DataAppFromTemplate', async () => {
        const template = await resolve(
            buildService(),
            buildUser(OrganizationMemberRole.EDITOR),
        );
        expect(template.slug).toBe('metric-forecaster');
    });

    it('refuses users without create:DataAppFromTemplate', async () => {
        await expect(
            resolve(
                buildService(),
                buildUser(OrganizationMemberRole.INTERACTIVE_VIEWER),
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('refuses builds when the templates feature is off', async () => {
        await expect(
            resolve(
                buildService({ flagEnabled: false }),
                buildUser(OrganizationMemberRole.ADMIN),
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it('reports an unknown slug as not found', async () => {
        await expect(
            resolve(
                buildService({ template: null }),
                buildUser(OrganizationMemberRole.EDITOR),
            ),
        ).rejects.toThrow(NotFoundError);
    });
});

const fakeSandbox = () => ({
    files: { write: vi.fn().mockResolvedValue(undefined) },
    commands: {
        run: vi.fn().mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' }),
    },
});

const prepare = (
    service: AppGenerateService,
    sandbox: ReturnType<typeof fakeSandbox>,
    orgTemplate: {
        slug: string;
        kind: 'seeded' | 'instructions';
        version: number;
    },
) =>
    (
        service as unknown as {
            prepareOrgTemplate: (
                sandbox: unknown,
                appUuid: string,
                orgTemplate: {
                    organizationUuid: string;
                    slug: string;
                    kind: 'seeded' | 'instructions';
                    version: number;
                },
            ) => Promise<string>;
        }
    ).prepareOrgTemplate(sandbox, 'app-1', {
        organizationUuid: ORG_UUID,
        ...orgTemplate,
    });

const templateService = (service: AppGenerateService) =>
    (
        service as unknown as {
            dataAppTemplateService: {
                getSourceFiles: ReturnType<typeof vi.fn>;
                getGuardrails: ReturnType<typeof vi.fn>;
            };
        }
    ).dataAppTemplateService;

describe('AppGenerateService: preparing the sandbox for an organization template', () => {
    it('seeds the source on the first build of a seeded template and asks the agent to bind it', async () => {
        const service = buildService();
        const sandbox = fakeSandbox();
        const instructions = await prepare(service, sandbox, {
            slug: 'metric-forecaster',
            kind: 'seeded',
            version: 1,
        });
        expect(sandbox.files.write).toHaveBeenCalledWith(
            '/tmp/template-src.tar',
            expect.any(Buffer),
        );
        expect(sandbox.commands.run.mock.calls[0][0]).toMatch(
            /tar -xf \/tmp\/template-src\.tar -C \/app/,
        );
        expect(instructions).toMatch(/BIND/);
        expect(instructions).toContain('Keep the methodology.');
        expect(templateService(service).getGuardrails).not.toHaveBeenCalled();
    });

    it('reads only the guardrails on iterations, never the package', async () => {
        const service = buildService();
        const sandbox = fakeSandbox();
        const instructions = await prepare(service, sandbox, {
            slug: 'metric-forecaster',
            kind: 'seeded',
            version: 2,
        });
        expect(templateService(service).getSourceFiles).not.toHaveBeenCalled();
        expect(sandbox.files.write).not.toHaveBeenCalled();
        expect(instructions).not.toMatch(/already contains the finished/);
        expect(instructions).toContain('Keep the methodology.');
    });

    it('keeps iterating an app whose template has been deleted', async () => {
        const service = buildService({ template: null });
        const sandbox = fakeSandbox();
        const instructions = await prepare(service, sandbox, {
            slug: 'metric-forecaster',
            kind: 'seeded',
            version: 3,
        });
        expect(instructions).toContain('metric-forecaster');
        expect(instructions).toContain('src/template.json');
        expect(instructions).not.toContain('Template guardrails');
    });

    it('does not claim a tool restriction the Codex path cannot enforce', async () => {
        const claude = await prepare(buildService(), fakeSandbox(), {
            slug: 'metric-forecaster',
            kind: 'seeded',
            version: 1,
        });
        expect(claude).toContain('the only file you can write');
        const codex = await prepare(
            buildService({ codingAgent: 'codex' }),
            fakeSandbox(),
            { slug: 'metric-forecaster', kind: 'seeded', version: 1 },
        );
        expect(codex).not.toContain('the only file you can write');
    });

    it('builds an instructions-only template from its AGENTS.md without seeding', async () => {
        const service = buildService({
            template: {
                ...TEMPLATE,
                kind: 'instructions',
                slug: 'exec-summary',
            },
            guardrails: 'One page. Three KPIs.',
        });
        const sandbox = fakeSandbox();
        const instructions = await prepare(service, sandbox, {
            slug: 'exec-summary',
            kind: 'instructions',
            version: 1,
        });
        expect(templateService(service).getSourceFiles).not.toHaveBeenCalled();
        expect(instructions).toContain('One page. Three KPIs.');
        expect(instructions).not.toMatch(/src\/template\.json/);
    });
});
