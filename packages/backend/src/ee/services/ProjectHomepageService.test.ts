import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    type HomepageConfig,
    type PossibleAbilities,
    type ProjectHomepage,
    type SessionUser,
} from '@lightdash/common';
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
}: {
    flagEnabled?: boolean;
    projectHomepageModel?: Partial<
        ProjectHomepageServiceArguments['projectHomepageModel']
    >;
    groupsModel?: Partial<ProjectHomepageServiceArguments['groupsModel']>;
    projectModel?: Partial<ProjectHomepageServiceArguments['projectModel']>;
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
            publish: vi.fn().mockResolvedValue(makeHomepage()),
            delete: vi.fn().mockResolvedValue(undefined),
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
    });

describe('ProjectHomepageService', () => {
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

    it('getPublishedHomepage resolves with the viewer’s groups and role', async () => {
        const resolvePublished = vi.fn().mockResolvedValue({
            homepageUuid: HOMEPAGE_UUID,
            name: 'Sales homepage',
            config: validConfig,
            allowPersonal: true,
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
});
