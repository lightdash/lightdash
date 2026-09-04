import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import {
    defineUserAbility,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
} from '@lightdash/common';
import { Readable } from 'node:stream';
import { pack as tarPack } from 'tar-stream';
import { describe, expect, it, vi } from 'vitest';
import { buildAccount } from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import type { DataAppTemplateModel } from '../../models/DataAppTemplateModel';
import { DataAppTemplateService } from './DataAppTemplateService';

const packFiles = (files: Record<string, string>): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const packer = tarPack();
        const chunks: Buffer[] = [];
        packer.on('data', (c: Buffer) => chunks.push(c));
        packer.on('end', () => resolve(Buffer.concat(chunks)));
        packer.on('error', reject);
        const entries = Object.entries(files);
        const next = (i: number) => {
            if (i >= entries.length) {
                packer.finalize();
                return;
            }
            const [name, contents] = entries[i];
            packer.entry({ name }, Buffer.from(contents, 'utf-8'), (err) => {
                if (err) reject(err);
                else next(i + 1);
            });
        };
        next(0);
    });

const MANIFEST = JSON.stringify({
    templateVersion: 1,
    template: {
        id: 'forecaster',
        name: 'Forecaster',
        description: 'A live what-if forecast.',
        category: 'Forecasting',
    },
    questions: [{ key: 'metric', label: 'What should we forecast?' }],
    bindings: { history: { explore: 'orders' } },
});

const packFilesWithDuplicate = (name: string): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const packer = tarPack();
        const chunks: Buffer[] = [];
        packer.on('data', (c: Buffer) => chunks.push(c));
        packer.on('end', () => resolve(Buffer.concat(chunks)));
        packer.on('error', reject);
        packer.entry({ name: 'src/template.json' }, MANIFEST, (e1) => {
            if (e1) return reject(e1);
            packer.entry({ name }, 'first', (e2) => {
                if (e2) return reject(e2);
                packer.entry({ name }, 'second', (e3) => {
                    if (e3) return reject(e3);
                    packer.finalize();
                    return undefined;
                });
                return undefined;
            });
            return undefined;
        });
    });

const buildService = (overrides: Partial<DataAppTemplateModel> = {}) => {
    const model = {
        findBySlug: vi.fn().mockResolvedValue(undefined),
        listFiles: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockImplementation(async (write, templateUuid) => ({
            created: true,
            summary: {
                templateUuid,
                organizationUuid: write.organizationUuid,
                slug: write.slug,
                name: write.name,
                description: write.description,
                category: write.category,
                questions: write.questions,
                fileCount: write.files.length,
                createdAt: new Date(),
                updatedAt: new Date(),
            },
        })),
        listByOrganization: vi.fn().mockResolvedValue([]),
        countByOrganization: vi.fn().mockResolvedValue(0),
        delete: vi.fn().mockResolvedValue(true),
        ...overrides,
    } as unknown as DataAppTemplateModel;
    const send = vi.fn(async (_command: unknown) => ({}));
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: true }),
    };
    const service = new DataAppTemplateService({
        lightdashConfig: lightdashConfigMock,
        dataAppTemplateModel: model,
        featureFlagModel: featureFlagModel as never,
    });
    (
        service as unknown as {
            getS3Client: () => { client: S3Client; bucket: string };
            createAuditedAbility: () => { cannot: () => boolean };
        }
    ).getS3Client = () => ({
        client: { send } as unknown as S3Client,
        bucket: 'test-bucket',
    });
    // Ability rules are covered in common; the service tests stub authz
    // the same way OrganizationDesignService's do.
    (
        service as unknown as {
            createAuditedAbility: () => { cannot: () => boolean };
        }
    ).createAuditedAbility = () => ({ cannot: () => false });
    return { service, model, send, featureFlagModel };
};

/**
 * Runs the service against the real CASL rules for a role, so the tests
 * exercise the create / manage@self / manage split rather than a stub.
 */
const withRole = (
    service: DataAppTemplateService,
    role: OrganizationMemberRole,
) => {
    const ability = defineUserAbility(
        {
            role,
            organizationUuid: 'test-org-uuid',
            userUuid: 'test-user-uuid',
            roleUuid: undefined,
        },
        [],
    );
    const patched = service as unknown as {
        createAuditedAbility: () => typeof ability;
    };
    patched.createAuditedAbility = () => ability;
    return service;
};

const importArchive = (service: DataAppTemplateService, archive: Buffer) =>
    service.importPackage(buildAccount(), {
        body: Readable.from(archive),
        contentLength: archive.length,
    });

describe('DataAppTemplateService.importPackage', () => {
    it('stores every authored file and registers the template from its manifest', async () => {
        const { service, model, send } = buildService();
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'src/App.jsx': 'export default () => null;',
            'AGENTS.md': '# guardrails',
        });

        const result = await importArchive(service, archive);

        expect(result.action).toBe('created');
        expect(result.slug).toBe('forecaster');
        expect(result.questions).toHaveLength(1);
        expect(model.upsert).toHaveBeenCalledTimes(1);
        const [write] = (model.upsert as ReturnType<typeof vi.fn>).mock
            .calls[0];
        expect(write.organizationUuid).toBe('test-org-uuid');
        expect(
            write.files.map((f: { filename: string }) => f.filename),
        ).toEqual(['AGENTS.md', 'src/App.jsx', 'src/template.json']);
        const puts = send.mock.calls.filter(
            ([command]) => command instanceof PutObjectCommand,
        );
        expect(puts).toHaveLength(3);
        const keys = puts.map(
            ([command]) => (command as PutObjectCommand).input.Key,
        );
        expect(
            keys.every((k) =>
                k?.startsWith('data-app-templates/test-org-uuid/'),
            ),
        ).toBe(true);
    });

    it('gates a new slug on create:DataAppTemplate for the account organization', async () => {
        const { service } = buildService();
        const checks: { action: string; subjectType: string }[] = [];
        (
            service as unknown as {
                createAuditedAbility: () => {
                    cannot: (action: string, sub: unknown) => boolean;
                };
            }
        ).createAuditedAbility = () => ({
            cannot: (action, sub) => {
                const subjectType = (sub as { __caslSubjectType__: string })
                    .__caslSubjectType__;
                checks.push({ action, subjectType });
                return true;
            },
        });
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'src/App.jsx': 'export {};',
        });

        await expect(importArchive(service, archive)).rejects.toThrow(
            ForbiddenError,
        );
        expect(checks).toEqual([
            { action: 'create', subjectType: 'DataAppTemplate' },
        ]);
    });

    it("lets an editor replace their own template but not a colleague's", async () => {
        const existingOwn = {
            templateUuid: '00000000-0000-4000-8000-000000000001',
            organizationUuid: 'test-org-uuid',
            slug: 'forecaster',
            name: 'Old',
            description: 'Old',
            category: 'Old',
            questions: [],
            fileCount: 1,
            createdByUserUuid: 'test-user-uuid',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const own = buildService({
            findBySlug: vi.fn().mockResolvedValue(existingOwn),
            upsert: vi.fn().mockResolvedValue({
                created: false,
                summary: { ...existingOwn, name: 'Forecaster' },
            }),
        } as unknown as Partial<DataAppTemplateModel>);
        withRole(own.service, OrganizationMemberRole.EDITOR);
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'src/App.jsx': 'export {};',
        });
        await expect(
            importArchive(own.service, archive),
        ).resolves.toMatchObject({ action: 'updated' });

        const colleagues = buildService({
            findBySlug: vi.fn().mockResolvedValue({
                ...existingOwn,
                createdByUserUuid: 'another-user',
            }),
        } as unknown as Partial<DataAppTemplateModel>);
        withRole(colleagues.service, OrganizationMemberRole.EDITOR);
        await expect(
            importArchive(colleagues.service, archive),
        ).rejects.toThrow(ForbiddenError);
        expect(colleagues.model.upsert).not.toHaveBeenCalled();
        expect(colleagues.send).not.toHaveBeenCalled();
    });

    it('lets an admin delete any template, and an editor only their own', async () => {
        const colleagueTemplate = {
            templateUuid: '00000000-0000-4000-8000-000000000002',
            organizationUuid: 'test-org-uuid',
            slug: 'scorecard',
            name: 'Scorecard',
            description: 'x',
            category: 'x',
            questions: [],
            fileCount: 0,
            createdByUserUuid: 'another-user',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const admin = buildService({
            findBySlug: vi.fn().mockResolvedValue(colleagueTemplate),
        } as unknown as Partial<DataAppTemplateModel>);
        withRole(admin.service, OrganizationMemberRole.ADMIN);
        await expect(
            admin.service.delete(buildAccount(), 'scorecard'),
        ).resolves.toBeUndefined();
        expect(admin.model.delete).toHaveBeenCalledWith(
            'test-org-uuid',
            'scorecard',
        );

        const editor = buildService({
            findBySlug: vi.fn().mockResolvedValue(colleagueTemplate),
        } as unknown as Partial<DataAppTemplateModel>);
        withRole(editor.service, OrganizationMemberRole.EDITOR);
        await expect(
            editor.service.delete(buildAccount(), 'scorecard'),
        ).rejects.toThrow(ForbiddenError);
        expect(editor.model.delete).not.toHaveBeenCalled();

        const owner = buildService({
            findBySlug: vi.fn().mockResolvedValue({
                ...colleagueTemplate,
                createdByUserUuid: 'test-user-uuid',
            }),
        } as unknown as Partial<DataAppTemplateModel>);
        withRole(owner.service, OrganizationMemberRole.EDITOR);
        await expect(
            owner.service.delete(buildAccount(), 'scorecard'),
        ).resolves.toBeUndefined();
        expect(owner.model.delete).toHaveBeenCalledTimes(1);
    });

    it('rejects a package that names the same file twice before touching storage', async () => {
        const { service, model, send } = buildService();
        // packFiles keys are unique by construction, so build the duplicate
        // entry by hand: two entries for src/App.jsx in one tar.
        const duplicate = await packFilesWithDuplicate('src/App.jsx');
        await expect(importArchive(service, duplicate)).rejects.toThrow(
            /twice/,
        );
        expect(model.upsert).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it('caps the number of templates an organization can hold', async () => {
        const { service, model, send } = buildService({
            countByOrganization: vi.fn().mockResolvedValue(50),
        } as unknown as Partial<DataAppTemplateModel>);
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'src/App.jsx': 'export {};',
        });
        await expect(importArchive(service, archive)).rejects.toThrow(
            /at most 50/,
        );
        expect(model.upsert).not.toHaveBeenCalled();
        expect(send).not.toHaveBeenCalled();
    });

    it('refuses uploads and browsing when the templates feature flag is off', async () => {
        const { service, featureFlagModel } = buildService();
        featureFlagModel.get.mockResolvedValue({ enabled: false });
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'src/App.jsx': 'export {};',
        });
        await expect(importArchive(service, archive)).rejects.toThrow(
            ForbiddenError,
        );
        await expect(service.list(buildAccount())).rejects.toThrow(
            ForbiddenError,
        );
        expect(featureFlagModel.get).toHaveBeenCalledWith(
            expect.objectContaining({
                featureFlagId: 'enable-data-app-templates',
            }),
        );
    });

    it('lets anyone who can build from templates browse them, and nobody below', async () => {
        const viewer = withRole(
            buildService().service,
            OrganizationMemberRole.INTERACTIVE_VIEWER,
        );
        await expect(viewer.list(buildAccount())).rejects.toThrow(
            ForbiddenError,
        );

        const editor = withRole(
            buildService().service,
            OrganizationMemberRole.EDITOR,
        );
        await expect(editor.list(buildAccount())).resolves.toEqual([]);
    });

    it('accepts an instructions-only package (manifest + AGENTS.md) and rejects one with nothing to build from', async () => {
        const { service, model } = buildService();
        const withGuidance = await packFiles({
            'src/template.json': MANIFEST,
            'AGENTS.md': 'Build a one-page executive summary.',
        });
        await expect(
            importArchive(service, withGuidance),
        ).resolves.toMatchObject({ action: 'created' });
        expect(model.upsert).toHaveBeenCalledTimes(1);

        const bare = buildService();
        const manifestOnly = await packFiles({ 'src/template.json': MANIFEST });
        await expect(importArchive(bare.service, manifestOnly)).rejects.toThrow(
            /AGENTS\.md/,
        );
        expect(bare.model.upsert).not.toHaveBeenCalled();
    });

    it('rejects an instructions-only package whose AGENTS.md is blank', async () => {
        const { service, model } = buildService();
        const blank = await packFiles({
            'src/template.json': MANIFEST,
            'AGENTS.md': '   \n\n',
        });
        await expect(importArchive(service, blank)).rejects.toThrow(
            /AGENTS\.md/,
        );
        expect(model.upsert).not.toHaveBeenCalled();
    });

    it('rejects a package without a manifest', async () => {
        const { service, model } = buildService();
        const archive = await packFiles({ 'src/App.jsx': '// no manifest' });
        await expect(importArchive(service, archive)).rejects.toThrow(
            ParameterError,
        );
        expect(model.upsert).not.toHaveBeenCalled();
    });

    it('rejects scaffold and tooling files', async () => {
        const { service, model } = buildService();
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'package.json': '{}',
        });
        await expect(importArchive(service, archive)).rejects.toThrow(
            /not allowed/,
        );
        expect(model.upsert).not.toHaveBeenCalled();
    });

    it('reports an update when the org already has the slug', async () => {
        const existing = {
            templateUuid: '00000000-0000-4000-8000-000000000001',
            organizationUuid: 'test-org-uuid',
            slug: 'forecaster',
            name: 'Old',
            description: 'Old',
            category: 'Old',
            questions: [],
            fileCount: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const { service } = buildService({
            findBySlug: vi.fn().mockResolvedValue(existing),
            upsert: vi.fn().mockResolvedValue({
                created: false,
                summary: { ...existing, name: 'Forecaster' },
            }),
        } as unknown as Partial<DataAppTemplateModel>);
        const archive = await packFiles({
            'src/template.json': MANIFEST,
            'src/App.jsx': 'export {};',
        });
        const result = await importArchive(service, archive);
        expect(result.action).toBe('updated');
        expect(result.templateUuid).toBe(existing.templateUuid);
    });
});

describe('DataAppTemplateService.importFromApp', () => {
    const b64 = (s: string) => Buffer.from(s, 'utf-8').toString('base64');
    const APP_FILES = [
        {
            path: 'src/App.jsx',
            contentBase64: b64('export default () => null;'),
        },
        {
            path: 'src/template.json',
            contentBase64: b64(
                JSON.stringify({
                    templateVersion: 1,
                    template: {
                        id: 'old',
                        name: 'Old',
                        description: 'o',
                        category: 'o',
                    },
                    bindings: { history: { explore: 'orders' } },
                }),
            ),
        },
        { path: 'package.json', contentBase64: b64('{}') },
    ];
    const REQUEST = {
        projectUuid: 'test-project-uuid',
        appUuid: 'app-1',
        template: {
            id: 'revenue-forecaster',
            name: 'Revenue Forecaster',
            description: 'Forecasts revenue.',
            category: 'Forecasting',
        },
        questions: [{ key: 'metric', label: 'What should we forecast?' }],
        guardrails: 'Keep the monthly methodology.',
    };

    it("packages the app's src tree with a merged manifest and the guardrails as AGENTS.md", async () => {
        const { service, model, send } = buildService();
        const result = await service.importFromApp(
            buildAccount(),
            REQUEST,
            APP_FILES,
        );
        expect(result.action).toBe('created');
        expect(result.slug).toBe('revenue-forecaster');
        const [write] = (model.upsert as ReturnType<typeof vi.fn>).mock
            .calls[0];
        expect(
            write.files.map((f: { filename: string }) => f.filename),
        ).toEqual(['AGENTS.md', 'src/App.jsx', 'src/template.json']);
        const puts = send.mock.calls
            .map(([command]) => command as PutObjectCommand)
            .filter((command) => command instanceof PutObjectCommand);
        const manifestPut = puts.find((c) =>
            c.input.Key?.endsWith('src/template.json'),
        );
        const manifest = JSON.parse(String(manifestPut?.input.Body));
        expect(manifest.template.id).toBe('revenue-forecaster');
        expect(manifest.questions).toEqual(REQUEST.questions);
        expect(manifest.bindings).toEqual({ history: { explore: 'orders' } });
        const guardrailsPut = puts.find((c) =>
            c.input.Key?.endsWith('AGENTS.md'),
        );
        expect(String(guardrailsPut?.input.Body)).toBe(
            'Keep the monthly methodology.\n',
        );
    });

    it('needs create:DataAppTemplate like any other publish', async () => {
        const { service, model } = buildService();
        withRole(service, OrganizationMemberRole.INTERACTIVE_VIEWER);
        await expect(
            service.importFromApp(buildAccount(), REQUEST, APP_FILES),
        ).rejects.toThrow(ForbiddenError);
        expect(model.upsert).not.toHaveBeenCalled();
    });

    it('rejects an app with no source files to package', async () => {
        const { service } = buildService();
        await expect(
            service.importFromApp(buildAccount(), REQUEST, [
                { path: 'package.json', contentBase64: b64('{}') },
            ]),
        ).rejects.toThrow(ParameterError);
    });
});

describe('DataAppTemplateService.getGuardrails', () => {
    const summary = {
        templateUuid: 'tpl-1',
        organizationUuid: 'test-org-uuid',
        slug: 'forecaster',
        name: 'Forecaster',
        description: 'x',
        category: 'Forecasting',
        questions: [],
        kind: 'seeded' as const,
        fileCount: 3,
        createdByUserUuid: 'u',
        createdAt: new Date(),
        updatedAt: new Date(),
    };

    it('reads only AGENTS.md, not the whole package', async () => {
        const { service, send } = buildService({
            findBySlug: vi.fn().mockResolvedValue(summary),
            listFiles: vi
                .fn()
                .mockResolvedValue([
                    { filename: 'src/App.tsx' },
                    { filename: 'src/template.json' },
                    { filename: 'AGENTS.md' },
                ]),
        });
        send.mockImplementation(async () => ({
            Body: Readable.from([Buffer.from('Keep the methodology.\n')]),
        }));
        const result = await service.getGuardrails(
            'test-org-uuid',
            'forecaster',
        );
        expect(result).toEqual({
            template: summary,
            guardrails: 'Keep the methodology.\n',
        });
        expect(send).toHaveBeenCalledTimes(1);
        expect(
            (send.mock.calls[0][0] as { input: { Key: string } }).input.Key,
        ).toMatch(/AGENTS\.md$/);
    });

    it('returns no guardrails when the package has none, and nothing when the template is gone', async () => {
        const { service, send } = buildService({
            findBySlug: vi.fn().mockResolvedValue(summary),
            listFiles: vi.fn().mockResolvedValue([{ filename: 'src/App.tsx' }]),
        });
        await expect(
            service.getGuardrails('test-org-uuid', 'forecaster'),
        ).resolves.toEqual({ template: summary, guardrails: null });
        expect(send).not.toHaveBeenCalled();

        const gone = buildService();
        await expect(
            gone.service.getGuardrails('test-org-uuid', 'forecaster'),
        ).resolves.toBeUndefined();
    });
});
