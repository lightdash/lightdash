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
        delete: vi.fn().mockResolvedValue(true),
        ...overrides,
    } as unknown as DataAppTemplateModel;
    const send = vi.fn(async (_command: unknown) => ({}));
    const service = new DataAppTemplateService({
        lightdashConfig: lightdashConfigMock,
        dataAppTemplateModel: model,
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
    return { service, model, send };
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
        const archive = await packFiles({ 'src/template.json': MANIFEST });

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
        const archive = await packFiles({ 'src/template.json': MANIFEST });
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
        const archive = await packFiles({ 'src/template.json': MANIFEST });
        const result = await importArchive(service, archive);
        expect(result.action).toBe('updated');
        expect(result.templateUuid).toBe(existing.templateUuid);
    });
});
