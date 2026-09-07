import { Ability } from '@casl/ability';
import {
    OrganizationMemberRole,
    ProjectMemberRole,
    ProjectType,
    type OrganizationProject,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
    provisionTrainingProject,
    TRAINING_PROJECT_NAME,
    type ProvisionTrainingProjectArguments,
} from './provisionTrainingProject';

const organizationUuid = '00000000-0000-0000-0000-000000000001';
const projectUuid = '00000000-0000-0000-0000-000000000002';
const now = new Date('2026-09-06T00:00:00Z');

const user = {
    userUuid: '00000000-0000-0000-0000-000000000003',
    organizationUuid,
    organizationName: 'Organization',
    organizationCreatedAt: now,
    email: 'admin@example.com',
    firstName: 'Admin',
    lastName: 'User',
    userId: 1,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>([
        { action: 'manage', subject: 'Organization' },
    ]),
    abilityRules: [],
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    avatarUrl: null,
    avatarGradient: null,
    isSetupComplete: true,
    isActive: true,
    createdAt: now,
    updatedAt: now,
    timezone: null,
} satisfies SessionUser;

const project = (type: ProjectType): OrganizationProject => ({
    projectUuid,
    slug: 'project',
    name: 'Project',
    type,
    provisioningSource: type === ProjectType.TRAINING ? 'training' : null,
    createdByUserUuid: user.userUuid,
    createdByUserName: 'Admin User',
    createdAt: now,
    upstreamProjectUuid: null,
    expiresAt: null,
});

const buildArguments = (
    overrides: Partial<ProvisionTrainingProjectArguments> = {},
) => {
    const getAllByOrganizationUuid = vi.fn(
        async (): Promise<OrganizationProject[]> => [
            project(ProjectType.DEFAULT),
        ],
    );
    const deleteProject = vi.fn(async () => undefined);
    const saveExploresToCache = vi.fn(async () => ({ cachedExploreUuids: [] }));
    const createProjectAccess = vi.fn(async () => undefined);
    const runInTrainingProvisioningLock = vi.fn(
        async (_org: string, callback: (trx: never) => Promise<unknown>) =>
            callback(undefined as never),
    );
    const createWithoutCompile = vi.fn(async () => ({
        project: { projectUuid },
        hasContentCopy: false,
    }));
    const indexCatalog = vi.fn(async () => ({
        totalIndexed: 0,
        errors: [],
        duration: 0,
    }));
    const seedTrainingContent = vi.fn(async () => undefined);
    const validateTrainingDatabase = vi.fn(async () => undefined);
    const track = vi.fn();
    return {
        args: {
            user,
            learnEnabled: true,
            projectModel: {
                getAllByOrganizationUuid,
                delete: deleteProject,
                saveExploresToCache,
                createProjectAccess,
            },
            onboardingModel: { runInTrainingProvisioningLock },
            projectService: { createWithoutCompile },
            catalogService: { indexCatalog },
            seedTrainingContent,
            analytics: { track },
            trainingDataDirectory: path.resolve(
                __dirname,
                '../../../assets/playground',
            ),
            validateTrainingDatabase,
            ...overrides,
        } as ProvisionTrainingProjectArguments,
        getAllByOrganizationUuid,
        deleteProject,
        saveExploresToCache,
        createProjectAccess,
        runInTrainingProvisioningLock,
        createWithoutCompile,
        indexCatalog,
        seedTrainingContent,
        track,
    };
};

describe('provisionTrainingProject', () => {
    it('refuses when Learn is switched off for the instance', async () => {
        const mocks = buildArguments({ learnEnabled: false });
        await expect(provisionTrainingProject(mocks.args)).rejects.toThrow(
            'Learn is not enabled on this instance',
        );
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                event: 'training_project.skipped',
                properties: expect.objectContaining({
                    reason: 'learn_disabled',
                }),
            }),
        );
    });

    it('returns the existing training project without creating another', async () => {
        const mocks = buildArguments();
        mocks.getAllByOrganizationUuid.mockResolvedValueOnce([
            project(ProjectType.DEFAULT),
            project(ProjectType.TRAINING),
        ]);
        await expect(provisionTrainingProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: false,
        });
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
        expect(mocks.seedTrainingContent).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                event: 'training_project.skipped',
                properties: expect.objectContaining({
                    reason: 'training_project_already_exists',
                    projectId: projectUuid,
                }),
            }),
        );
    });

    it('creates the training project under the org lock, with the caller as its admin', async () => {
        const mocks = buildArguments();
        await expect(provisionTrainingProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: true,
        });
        expect(mocks.runInTrainingProvisioningLock).toHaveBeenCalledWith(
            organizationUuid,
            expect.any(Function),
        );
        expect(mocks.createWithoutCompile).toHaveBeenCalledExactlyOnceWith(
            user,
            expect.objectContaining({
                name: TRAINING_PROJECT_NAME,
                type: ProjectType.TRAINING,
            }),
            expect.any(String),
            { source: 'training' },
        );
        expect(mocks.saveExploresToCache).toHaveBeenCalledWith(
            projectUuid,
            expect.any(Array),
            true,
        );
        expect(mocks.createProjectAccess).toHaveBeenCalledExactlyOnceWith(
            projectUuid,
            user.email,
            ProjectMemberRole.ADMIN,
        );
        expect(mocks.seedTrainingContent).toHaveBeenCalledExactlyOnceWith({
            projectUuid,
            user,
            content: expect.objectContaining({
                version: 1,
                space: { name: 'Training', path: 'training' },
            }),
        });
        expect(mocks.indexCatalog).toHaveBeenCalledWith(
            projectUuid,
            user.userUuid,
        );
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith({
            event: 'training_project.provisioned',
            userId: user.userUuid,
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                contentSeedErrorType: null,
                catalogIndexErrorType: null,
            },
        });
    });

    it('removes the project when the admin membership cannot be written', async () => {
        const mocks = buildArguments();
        mocks.createProjectAccess.mockRejectedValueOnce(
            new Error('no such user'),
        );
        await expect(provisionTrainingProject(mocks.args)).rejects.toThrow(
            'no such user',
        );
        expect(mocks.deleteProject).toHaveBeenCalledWith(projectUuid);
        expect(mocks.seedTrainingContent).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                event: 'training_project.failed',
                properties: expect.objectContaining({
                    projectId: projectUuid,
                    errorType: 'Error',
                }),
            }),
        );
    });

    it('removes the project when seeding fails, so the admin can enable again', async () => {
        const mocks = buildArguments();
        mocks.seedTrainingContent.mockRejectedValueOnce(
            new TypeError('bad content'),
        );
        await expect(provisionTrainingProject(mocks.args)).rejects.toThrow(
            'bad content',
        );
        expect(mocks.deleteProject).toHaveBeenCalledWith(projectUuid);
        expect(mocks.indexCatalog).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                event: 'training_project.failed',
                properties: expect.objectContaining({ errorType: 'TypeError' }),
            }),
        );
    });

    it('still provisions when catalog indexing fails, recording the error type', async () => {
        const mocks = buildArguments();
        mocks.indexCatalog.mockRejectedValueOnce(new RangeError('no index'));
        await expect(provisionTrainingProject(mocks.args)).resolves.toEqual({
            projectUuid,
            created: true,
        });
        expect(mocks.deleteProject).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({
                event: 'training_project.provisioned',
                properties: expect.objectContaining({
                    contentSeedErrorType: null,
                    catalogIndexErrorType: 'RangeError',
                }),
            }),
        );
    });

    it('does not create a project when the bundle cannot be validated', async () => {
        const mocks = buildArguments();
        (
            mocks.args.validateTrainingDatabase as ReturnType<typeof vi.fn>
        ).mockRejectedValueOnce(new Error('bundle missing'));
        await expect(provisionTrainingProject(mocks.args)).rejects.toThrow(
            'bundle missing',
        );
        expect(mocks.createWithoutCompile).not.toHaveBeenCalled();
        expect(mocks.track).toHaveBeenCalledExactlyOnceWith(
            expect.objectContaining({ event: 'training_project.failed' }),
        );
    });
});
