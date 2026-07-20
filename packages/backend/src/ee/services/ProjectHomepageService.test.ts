import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectMemberRole,
    type HomepageConfig,
    type PossibleAbilities,
    type ProjectHomepage,
    type SessionUser,
} from '@lightdash/common';
import { Readable } from 'stream';
import {
    ProjectHomepageService,
    type ProjectHomepageServiceArguments,
} from './ProjectHomepageService';

const NOW = new Date('2026-07-14T10:00:00.000Z');
const ORGANIZATION_UUID = '00000000-0000-0000-0000-000000000001';
const PROJECT_UUID = '00000000-0000-0000-0000-000000000002';
const USER_UUID = '00000000-0000-0000-0000-000000000004';
const HOMEPAGE_UUID = '00000000-0000-0000-0000-000000000010';

const validConfig: HomepageConfig = {
    version: 1,
    rows: [
        {
            id: 'row-1',
            blocks: [
                { id: 'b1', type: 'markdown', config: { content: 'hello' } },
            ],
        },
    ],
};

const makeHomepage = (
    overrides: Partial<ProjectHomepage> = {},
): ProjectHomepage => ({
    homepageUuid: HOMEPAGE_UUID,
    projectUuid: PROJECT_UUID,
    name: 'Team homepage',
    draftConfig: validConfig,
    publishedConfig: null,
    isDefault: true,
    allowPersonal: true,
    createdByUserUuid: USER_UUID,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
});

const baseUser = (): Omit<SessionUser, 'ability'> => ({
    userUuid: USER_UUID,
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: ORGANIZATION_UUID,
    organizationName: 'Acme',
    organizationCreatedAt: NOW,
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    isSetupComplete: true,
    isActive: true,
    createdAt: NOW,
    updatedAt: NOW,
    timezone: null,
    abilityRules: [],
});

const makeAdminUser = (): SessionUser => ({
    ...baseUser(),
    ability: new Ability<PossibleAbilities>([
        {
            action: 'view',
            subject: 'Project',
            conditions: { projectUuid: PROJECT_UUID },
        },
        {
            action: 'manage',
            subject: 'ProjectHomepage',
            conditions: { projectUuid: PROJECT_UUID },
        },
    ]),
});

const makeViewerUser = (): SessionUser => ({
    ...baseUser(),
    role: OrganizationMemberRole.VIEWER,
    ability: new Ability<PossibleAbilities>([
        {
            action: 'view',
            subject: 'Project',
            conditions: { projectUuid: PROJECT_UUID },
        },
    ]),
});

const makeService = ({
    flagEnabled = true,
    projectHomepageModel = {},
    groupsModel = {},
    projectModel = {},
    fileStorageClient = {},
    persistentDownloadFileService = {},
}: {
    flagEnabled?: boolean;
    projectHomepageModel?: Partial<
        ProjectHomepageServiceArguments['projectHomepageModel']
    >;
    groupsModel?: Partial<ProjectHomepageServiceArguments['groupsModel']>;
    projectModel?: Partial<ProjectHomepageServiceArguments['projectModel']>;
    fileStorageClient?: Partial<
        ProjectHomepageServiceArguments['fileStorageClient']
    >;
    persistentDownloadFileService?: Partial<
        ProjectHomepageServiceArguments['persistentDownloadFileService']
    >;
} = {}) =>
    new ProjectHomepageService({
        featureFlagService: {
            get: vi.fn().mockResolvedValue({
                id: 'homepage-builder',
                enabled: flagEnabled,
            }),
        },
        projectHomepageModel: {
            getDefault: vi.fn().mockResolvedValue(undefined),
            getByUuid: vi.fn().mockResolvedValue(makeHomepage()),
            getPublishedDefault: vi.fn().mockResolvedValue(undefined),
            getRecentlyViewed: vi.fn().mockResolvedValue([]),
            getAssignments: vi.fn().mockResolvedValue([]),
            getPersonalOverride: vi.fn().mockResolvedValue(undefined),
            setPersonalOverride: vi.fn().mockResolvedValue(undefined),
            deletePersonalOverride: vi.fn().mockResolvedValue(undefined),
            updateGroupPriorities: vi.fn().mockResolvedValue(undefined),
            resolvePublished: vi.fn().mockResolvedValue(undefined),
            list: vi.fn().mockResolvedValue([]),
            create: vi.fn().mockResolvedValue(makeHomepage()),
            updateDraft: vi.fn().mockResolvedValue(makeHomepage()),
            discardDraft: vi.fn().mockResolvedValue(makeHomepage()),
            publish: vi.fn().mockResolvedValue(makeHomepage()),
            delete: vi.fn().mockResolvedValue(undefined),
            listAnnouncements: vi
                .fn()
                .mockResolvedValue({ items: [], totalCount: 0 }),
            getAnnouncement: vi.fn().mockResolvedValue(undefined),
            createAnnouncement: vi.fn(),
            updateAnnouncement: vi.fn(),
            deleteAnnouncement: vi.fn().mockResolvedValue(undefined),
            ...projectHomepageModel,
        },
        groupsModel: {
            findUserGroups: vi.fn().mockResolvedValue([]),
            ...groupsModel,
        },
        projectModel: {
            getProjectMemberAccess: vi.fn().mockResolvedValue(undefined),
            ...projectModel,
        },
        fileStorageClient: {
            uploadImage: vi.fn(),
            ...fileStorageClient,
        } as ProjectHomepageServiceArguments['fileStorageClient'],
        persistentDownloadFileService: {
            createPersistentUrl: vi.fn(),
            ...persistentDownloadFileService,
        } as ProjectHomepageServiceArguments['persistentDownloadFileService'],
    });

describe('ProjectHomepageService', () => {
    it('accepts fileStorageClient and persistentDownloadFileService in its constructor', () => {
        expect(() => makeService()).not.toThrow();
    });

    it('getPublishedHomepage throws ForbiddenError when flag is disabled', async () => {
        const service = makeService({ flagEnabled: false });

        await expect(
            service.getResolvedHomepage(makeAdminUser(), PROJECT_UUID),
        ).rejects.toThrow(ForbiddenError);
    });

    it('getPublishedHomepage returns null when nothing is published', async () => {
        const service = makeService();

        await expect(
            service.getResolvedHomepage(makeViewerUser(), PROJECT_UUID),
        ).resolves.toBeNull();
    });

    it('createHomepage throws ForbiddenError for a viewer', async () => {
        const service = makeService();

        await expect(
            service.createHomepage(makeViewerUser(), PROJECT_UUID, {
                name: 'Nope',
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('createHomepage copies the draft config when duplicating', async () => {
        const create = vi.fn().mockResolvedValue(makeHomepage());
        const service = makeService({
            projectHomepageModel: {
                getByUuid: vi
                    .fn()
                    .mockResolvedValue(
                        makeHomepage({ draftConfig: validConfig }),
                    ),
                create,
            },
        });

        await service.createHomepage(makeAdminUser(), PROJECT_UUID, {
            name: 'Copy',
            duplicateFrom: HOMEPAGE_UUID,
        });

        expect(create).toHaveBeenCalledWith(
            expect.objectContaining({
                name: 'Copy',
                draftConfig: validConfig,
            }),
        );
    });

    it('deleteHomepage rejects a homepage from another project', async () => {
        const service = makeService({
            projectHomepageModel: {
                getByUuid: vi
                    .fn()
                    .mockResolvedValue(
                        makeHomepage({ projectUuid: 'other-project-uuid' }),
                    ),
            },
        });

        await expect(
            service.deleteHomepage(
                makeAdminUser(),
                PROJECT_UUID,
                HOMEPAGE_UUID,
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('updateDraft rejects a row with more than 3 blocks', async () => {
        const service = makeService({
            projectHomepageModel: {
                getDefault: vi.fn().mockResolvedValue(makeHomepage()),
            },
        });
        const block = {
            id: 'b',
            type: 'markdown' as const,
            config: { content: 'x' },
        };

        await expect(
            service.updateDraft(makeAdminUser(), PROJECT_UUID, HOMEPAGE_UUID, {
                draftConfig: {
                    version: 1,
                    rows: [
                        {
                            id: 'row-1',
                            blocks: [block, block, block, block],
                        },
                    ],
                },
                baseUpdatedAt: NOW,
            }),
        ).rejects.toThrow(ParameterError);
    });

    it('updateDraft throws NotFoundError when the homepage belongs to another project', async () => {
        const service = makeService({
            projectHomepageModel: {
                getByUuid: vi
                    .fn()
                    .mockResolvedValue(
                        makeHomepage({ projectUuid: 'other-project-uuid' }),
                    ),
            },
        });

        await expect(
            service.updateDraft(makeAdminUser(), PROJECT_UUID, HOMEPAGE_UUID, {
                draftConfig: validConfig,
                baseUpdatedAt: NOW,
            }),
        ).rejects.toThrow(NotFoundError);
    });

    it('publishHomepage publishes for an admin when the flag is on', async () => {
        const publish = vi
            .fn()
            .mockResolvedValue(makeHomepage({ publishedConfig: validConfig }));
        const service = makeService({
            projectHomepageModel: {
                getDefault: vi.fn().mockResolvedValue(makeHomepage()),
                publish,
            },
        });

        const result = await service.publishHomepage(
            makeAdminUser(),
            PROJECT_UUID,
            HOMEPAGE_UUID,
            { type: 'everyone' },
            true,
        );

        expect(publish).toHaveBeenCalledWith(
            HOMEPAGE_UUID,
            { type: 'everyone' },
            true,
        );
        expect(result.publishedConfig).toEqual(validConfig);
    });

    it('discardDraft reverts the draft to the published config for an admin when the flag is on', async () => {
        const discardDraft = vi.fn().mockResolvedValue(
            makeHomepage({
                draftConfig: validConfig,
                publishedConfig: validConfig,
            }),
        );
        const service = makeService({
            projectHomepageModel: { discardDraft },
        });

        const result = await service.discardDraft(
            makeAdminUser(),
            PROJECT_UUID,
            HOMEPAGE_UUID,
        );

        expect(discardDraft).toHaveBeenCalledWith(HOMEPAGE_UUID);
        expect(result.draftConfig).toEqual(validConfig);
    });

    it('discardDraft throws NotFoundError for a homepage in another project', async () => {
        const service = makeService({
            projectHomepageModel: {
                getByUuid: vi
                    .fn()
                    .mockResolvedValue(
                        makeHomepage({ projectUuid: 'other-project-uuid' }),
                    ),
            },
        });

        await expect(
            service.discardDraft(makeAdminUser(), PROJECT_UUID, HOMEPAGE_UUID),
        ).rejects.toThrow(NotFoundError);
    });

    it('getPublishedHomepage resolves with the viewer’s groups and role', async () => {
        const resolvePublished = vi.fn().mockResolvedValue({
            homepage: {
                homepageUuid: HOMEPAGE_UUID,
                name: 'Sales homepage',
                config: validConfig,
                allowPersonal: true,
            },
            source: { type: 'group', groupUuid: 'group-1', priority: 1 },
        });
        const service = makeService({
            projectHomepageModel: { resolvePublished },
            groupsModel: {
                findUserGroups: vi
                    .fn()
                    .mockResolvedValue([{ uuid: 'group-1', name: 'Sales' }]),
            },
            projectModel: {
                getProjectMemberAccess: vi.fn().mockResolvedValue({
                    userUuid: USER_UUID,
                    projectUuid: PROJECT_UUID,
                    role: 'editor',
                    email: 'x@y.z',
                    firstName: 'A',
                    lastName: 'B',
                }),
            },
        });

        const result = await service.getResolvedHomepage(
            makeViewerUser(),
            PROJECT_UUID,
        );

        expect(resolvePublished).toHaveBeenCalledWith(PROJECT_UUID, {
            groupUuids: ['group-1'],
            role: 'editor',
        });
        expect(result).toEqual(
            expect.objectContaining({
                type: 'homepage',
                homepage: expect.objectContaining({ name: 'Sales homepage' }),
            }),
        );
    });

    it('viewAsHomepage is forbidden for a viewer', async () => {
        const service = makeService();

        await expect(
            service.viewAsHomepage(makeViewerUser(), PROJECT_UUID, {
                type: 'role',
                role: ProjectMemberRole.EDITOR,
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    it('viewAsHomepage resolves a role target through the shared resolver with a reason', async () => {
        const resolvePublished = vi.fn().mockResolvedValue({
            homepage: {
                homepageUuid: HOMEPAGE_UUID,
                name: 'Editors homepage',
                config: validConfig,
                allowPersonal: true,
            },
            source: { type: 'role', role: 'editor' },
        });
        const getPersonalOverride = vi.fn();
        const service = makeService({
            projectHomepageModel: { resolvePublished, getPersonalOverride },
        });

        const result = await service.viewAsHomepage(
            makeAdminUser(),
            PROJECT_UUID,
            { type: 'role', role: ProjectMemberRole.EDITOR },
        );

        expect(resolvePublished).toHaveBeenCalledWith(PROJECT_UUID, {
            groupUuids: [],
            role: 'editor',
        });
        // group/role targets never consult the target's personal override
        expect(getPersonalOverride).not.toHaveBeenCalled();
        expect(result.reason).toEqual({ type: 'role', role: 'editor' });
        expect(result.resolved).toEqual(
            expect.objectContaining({ type: 'homepage' }),
        );
    });

    it("viewAsHomepage for a user target applies the target's personal override", async () => {
        const service = makeService({
            projectHomepageModel: {
                getPersonalOverride: vi
                    .fn()
                    .mockResolvedValue('dashboard-uuid-1'),
                resolvePublished: vi.fn().mockResolvedValue(undefined),
            },
        });

        const result = await service.viewAsHomepage(
            makeAdminUser(),
            PROJECT_UUID,
            { type: 'user', userUuid: USER_UUID },
        );

        expect(result).toEqual({
            resolved: { type: 'dashboard', dashboardUuid: 'dashboard-uuid-1' },
            reason: { type: 'personal', dashboardUuid: 'dashboard-uuid-1' },
        });
    });

    describe('announcements', () => {
        it('createAnnouncement is forbidden for a viewer', async () => {
            const service = makeService();
            await expect(
                service.createAnnouncement(makeViewerUser(), PROJECT_UUID, {
                    title: 'Hello',
                    body: null,
                }),
            ).rejects.toThrow(ForbiddenError);
        });

        it('createAnnouncement rejects an empty title', async () => {
            const service = makeService();
            await expect(
                service.createAnnouncement(makeAdminUser(), PROJECT_UUID, {
                    title: '   ',
                    body: null,
                }),
            ).rejects.toThrow(ParameterError);
        });

        it('updateAnnouncement passes pinned through for an owned announcement', async () => {
            const announcement = {
                announcementUuid: 'ann-1',
                projectUuid: PROJECT_UUID,
                title: 'Hello',
                body: null,
                pinned: false,
                createdByUserUuid: 'user-1',
                authorName: 'Ana',
                createdAt: new Date(),
                updatedAt: new Date(),
            };
            const updateAnnouncement = vi
                .fn()
                .mockResolvedValue({ ...announcement, pinned: true });
            const service = makeService({
                projectHomepageModel: {
                    getAnnouncement: vi.fn().mockResolvedValue(announcement),
                    updateAnnouncement,
                },
            });
            const result = await service.updateAnnouncement(
                makeAdminUser(),
                PROJECT_UUID,
                'ann-1',
                { pinned: true },
            );
            expect(updateAnnouncement).toHaveBeenCalledWith('ann-1', {
                pinned: true,
            });
            expect(result.pinned).toBe(true);
        });

        it('updateAnnouncement 404s for an announcement in another project', async () => {
            const service = makeService({
                projectHomepageModel: {
                    getAnnouncement: vi.fn().mockResolvedValue({
                        announcementUuid: 'ann-1',
                        projectUuid: 'other-project',
                    }),
                },
            });
            await expect(
                service.updateAnnouncement(
                    makeAdminUser(),
                    PROJECT_UUID,
                    'ann-1',
                    { pinned: true },
                ),
            ).rejects.toThrow(NotFoundError);
        });

        it('listAnnouncements allows a viewer and rejects bad pagination', async () => {
            const service = makeService();
            await expect(
                service.listAnnouncements(makeViewerUser(), PROJECT_UUID, {
                    page: 1,
                    pageSize: 25,
                }),
            ).resolves.toEqual({ items: [], totalCount: 0 });
            await expect(
                service.listAnnouncements(makeViewerUser(), PROJECT_UUID, {
                    page: 0,
                    pageSize: 25,
                }),
            ).rejects.toThrow(ParameterError);
        });

        describe('uploadAnnouncementImage', () => {
            // Minimal 1x1 PNG, valid enough for `loadImage` to decode.
            const tinyPng = Buffer.from(
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
                'base64',
            );

            const bufferToReadable = (buf: Buffer): Readable => {
                const readable = new Readable();
                readable.push(buf);
                readable.push(null);
                return readable;
            };

            it('is forbidden for a viewer', async () => {
                const service = makeService();
                await expect(
                    service.uploadAnnouncementImage(
                        makeViewerUser(),
                        PROJECT_UUID,
                        'image/png',
                        bufferToReadable(tinyPng),
                        tinyPng.length,
                    ),
                ).rejects.toThrow(ForbiddenError);
            });

            it('rejects unsupported mime types', async () => {
                const service = makeService();
                await expect(
                    service.uploadAnnouncementImage(
                        makeAdminUser(),
                        PROJECT_UUID,
                        'application/pdf',
                        bufferToReadable(tinyPng),
                        tinyPng.length,
                    ),
                ).rejects.toThrow(ParameterError);
            });

            it('rejects uploads over the size cap', async () => {
                const service = makeService();
                await expect(
                    service.uploadAnnouncementImage(
                        makeAdminUser(),
                        PROJECT_UUID,
                        'image/png',
                        bufferToReadable(tinyPng),
                        6 * 1024 * 1024,
                    ),
                ).rejects.toThrow(ParameterError);
            });

            it('uploads the normalized image and returns a persistent URL', async () => {
                const uploadImage = vi
                    .fn()
                    .mockResolvedValue('https://s3/presigned');
                const createPersistentUrl = vi
                    .fn()
                    .mockResolvedValue(
                        'https://app.lightdash.com/api/v1/file/abc123',
                    );
                const service = makeService({
                    fileStorageClient: { uploadImage },
                    persistentDownloadFileService: { createPersistentUrl },
                });

                const result = await service.uploadAnnouncementImage(
                    makeAdminUser(),
                    PROJECT_UUID,
                    'image/png',
                    bufferToReadable(tinyPng),
                    tinyPng.length,
                );

                expect(uploadImage).toHaveBeenCalledWith(
                    expect.any(Buffer),
                    expect.stringMatching(
                        new RegExp(`^announcements/${PROJECT_UUID}/`),
                    ),
                );
                expect(createPersistentUrl).toHaveBeenCalledWith(
                    expect.objectContaining({
                        fileType: 'image',
                        organizationUuid: ORGANIZATION_UUID,
                        projectUuid: PROJECT_UUID,
                        createdByUserUuid: USER_UUID,
                    }),
                );
                expect(result).toEqual({
                    url: 'https://app.lightdash.com/api/v1/file/abc123',
                });
            });
        });
    });
});
