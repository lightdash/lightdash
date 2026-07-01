import { Ability } from '@casl/ability';
import {
    DbtProjectType,
    ForbiddenError,
    ParameterError,
    PossibleAbilities,
    SessionUser,
    UnexpectedServerError,
} from '@lightdash/common';
import { fromSession } from '../auth/account/account';
import { buildAccount, defaultSessionUser } from '../auth/account/account.mock';
import { ProjectDbtSourcesService } from './ProjectDbtSourcesService';

const projectUuid = '11111111-1111-4111-8111-111111111111';
const otherProjectUuid = '99999999-9999-4999-8999-999999999999';
const sourceUuid = '22222222-2222-4222-8222-222222222222';

const adminSessionUser: SessionUser = {
    ...defaultSessionUser,
    ability: new Ability<PossibleAbilities>([
        { subject: 'Project', action: ['view', 'update', 'manage'] },
    ]),
};
const adminAccount = fromSession(adminSessionUser, 'session-cookie');

// buildAccount() defaults to a developer-level ability: `update`/`view` on
// Project but NOT `manage` — additional dbt source mutations require `manage`.
const developerAccount = buildAccount();

const githubConnection = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'installation_id',
    repository: 'acme/jaffle',
    branch: 'main',
    project_sub_path: '/dbt',
    installation_id: '123',
} as const;

const primaryDbtConnection = {
    type: DbtProjectType.GITHUB,
    authorization_method: 'installation_id',
    repository: 'acme/primary',
    branch: 'main',
    project_sub_path: '/dbt',
    installation_id: '456',
} as const;

const projectModel = {
    getSummary: vi.fn(async (uuid: string) => ({
        organizationUuid: 'org-uuid',
        projectUuid: uuid,
        name: 'Test project',
    })),
    get: vi.fn(async (uuid: string) => ({
        projectUuid: uuid,
        dbtConnection: primaryDbtConnection,
    })),
};

const projectDbtSourcesModel = {
    getSources: vi.fn(async () => []),
    getSource: vi.fn(),
    createSource: vi.fn(),
    updateSource: vi.fn(),
    deleteSource: vi.fn(),
};

const getService = () =>
    new ProjectDbtSourcesService({
        lightdashConfig: {} as never,
        analytics: { track: vi.fn() } as never,
        projectModel: projectModel as never,
        projectDbtSourcesModel: projectDbtSourcesModel as never,
    });

describe('ProjectDbtSourcesService', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        projectModel.getSummary.mockResolvedValue({
            organizationUuid: 'org-uuid',
            projectUuid,
            name: 'Test project',
        } as never);
        projectModel.get.mockResolvedValue({
            projectUuid,
            dbtConnection: primaryDbtConnection,
        } as never);
        projectDbtSourcesModel.getSources.mockResolvedValue([]);
    });

    describe('getProjectDbtSources', () => {
        it('synthesises the primary source from the project dbt_connection with precedence 0', async () => {
            const service = getService();

            const sources = await service.getProjectDbtSources(
                adminAccount,
                projectUuid,
            );

            expect(sources[0]).toMatchObject({
                projectDbtSourceUuid: projectUuid,
                name: 'Project dbt connection',
                isPrimary: true,
                precedence: 0,
                type: DbtProjectType.GITHUB,
                repository: 'acme/primary',
            });
        });

        it('allows a developer (view-only) account to list sources', async () => {
            const service = getService();

            await expect(
                service.getProjectDbtSources(developerAccount, projectUuid),
            ).resolves.toBeDefined();
        });

        it('does not fail the whole list when one source has a credential error', async () => {
            projectDbtSourcesModel.getSources.mockResolvedValue([
                {
                    projectDbtSourceUuid: sourceUuid,
                    name: 'broken-source',
                    isPrimary: false,
                    precedence: 1,
                    dbtConnection: null,
                    hasCredentialError: true,
                } as never,
                {
                    projectDbtSourceUuid:
                        '33333333-3333-4333-8333-333333333333',
                    name: 'healthy-source',
                    isPrimary: false,
                    precedence: 2,
                    dbtConnection: githubConnection,
                    hasCredentialError: false,
                } as never,
            ]);
            const service = getService();

            const sources = await service.getProjectDbtSources(
                adminAccount,
                projectUuid,
            );

            expect(sources).toHaveLength(3); // primary + broken + healthy
            const broken = sources.find((s) => s.name === 'broken-source');
            expect(broken).toMatchObject({
                hasCredentialError: true,
                repository: null,
            });
            const healthy = sources.find((s) => s.name === 'healthy-source');
            expect(healthy).toMatchObject({
                hasCredentialError: false,
                repository: 'acme/jaffle',
            });
        });
    });

    describe('createProjectDbtSource', () => {
        it('rejects non-GitHub connection types', async () => {
            const service = getService();

            await expect(
                service.createProjectDbtSource(adminAccount, projectUuid, {
                    name: 'gitlab-source',
                    dbtConnection: { type: DbtProjectType.GITLAB } as never,
                }),
            ).rejects.toThrow(ParameterError);

            expect(projectDbtSourcesModel.createSource).not.toHaveBeenCalled();
        });

        it('creates a GitHub source at precedence = max(existing) + 1', async () => {
            projectDbtSourcesModel.getSources.mockResolvedValue([
                { precedence: 1 } as never,
                { precedence: 3 } as never,
            ]);
            projectDbtSourcesModel.createSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                name: 'jaffle-2',
                isPrimary: false,
                precedence: 4,
                dbtConnection: githubConnection,
            } as never);
            const service = getService();

            const created = await service.createProjectDbtSource(
                adminAccount,
                projectUuid,
                { name: 'jaffle-2', dbtConnection: githubConnection as never },
            );

            expect(projectDbtSourcesModel.createSource).toHaveBeenCalledWith(
                projectUuid,
                expect.objectContaining({ isPrimary: false, precedence: 4 }),
            );
            expect(created.precedence).toBe(4);
        });

        it('rejects a developer (no manage permission) with ForbiddenError', async () => {
            const service = getService();

            await expect(
                service.createProjectDbtSource(developerAccount, projectUuid, {
                    name: 'jaffle-2',
                    dbtConnection: githubConnection as never,
                }),
            ).rejects.toThrow(ForbiddenError);

            expect(projectDbtSourcesModel.createSource).not.toHaveBeenCalled();
        });
    });

    describe('updateProjectDbtSource', () => {
        it('rejects non-GitHub connection types on update, matching create', async () => {
            projectDbtSourcesModel.getSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                projectUuid,
                dbtConnection: githubConnection,
            } as never);
            const service = getService();

            await expect(
                service.updateProjectDbtSource(
                    adminAccount,
                    projectUuid,
                    sourceUuid,
                    { dbtConnection: { type: DbtProjectType.GITLAB } as never },
                ),
            ).rejects.toThrow(ParameterError);

            expect(projectDbtSourcesModel.updateSource).not.toHaveBeenCalled();
        });

        it('rejects a source uuid that belongs to a different project', async () => {
            projectDbtSourcesModel.getSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                projectUuid: otherProjectUuid,
                dbtConnection: githubConnection,
            } as never);
            const service = getService();

            await expect(
                service.updateProjectDbtSource(
                    adminAccount,
                    projectUuid,
                    sourceUuid,
                    { name: 'renamed' },
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('getProjectDbtSource (credential stripping)', () => {
        it('strips sensitive credential fields from the returned connection', async () => {
            projectDbtSourcesModel.getSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                projectUuid,
                name: 'jaffle-2',
                isPrimary: false,
                precedence: 1,
                dbtConnection: {
                    type: DbtProjectType.GITHUB,
                    authorization_method: 'personal_access_token',
                    personal_access_token: 'super-secret-token',
                    repository: 'acme/jaffle-2',
                    branch: 'main',
                    project_sub_path: '/dbt',
                },
            } as never);
            const service = getService();

            const result = await service.getProjectDbtSource(
                adminAccount,
                projectUuid,
                sourceUuid,
            );

            expect(result.dbtConnection).not.toHaveProperty(
                'personal_access_token',
            );
            expect(result.dbtConnection).toMatchObject({
                repository: 'acme/jaffle-2',
            });
        });

        it('fails clearly, naming the source, when its credentials cannot be decrypted', async () => {
            projectDbtSourcesModel.getSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                projectUuid,
                name: 'broken-source',
                isPrimary: false,
                precedence: 1,
                dbtConnection: null,
                hasCredentialError: true,
            } as never);
            const service = getService();

            await expect(
                service.getProjectDbtSource(
                    adminAccount,
                    projectUuid,
                    sourceUuid,
                ),
            ).rejects.toThrow(UnexpectedServerError);
            await expect(
                service.getProjectDbtSource(
                    adminAccount,
                    projectUuid,
                    sourceUuid,
                ),
            ).rejects.toThrow(/broken-source/);
        });
    });

    describe('deleteProjectDbtSource', () => {
        it('rejects a source uuid that belongs to a different project', async () => {
            projectDbtSourcesModel.getSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                projectUuid: otherProjectUuid,
            } as never);
            const service = getService();

            await expect(
                service.deleteProjectDbtSource(
                    adminAccount,
                    projectUuid,
                    sourceUuid,
                ),
            ).rejects.toThrow(ForbiddenError);

            expect(projectDbtSourcesModel.deleteSource).not.toHaveBeenCalled();
        });

        it('deletes a source belonging to the project', async () => {
            projectDbtSourcesModel.getSource.mockResolvedValue({
                projectDbtSourceUuid: sourceUuid,
                projectUuid,
            } as never);
            const service = getService();

            await service.deleteProjectDbtSource(
                adminAccount,
                projectUuid,
                sourceUuid,
            );

            expect(projectDbtSourcesModel.deleteSource).toHaveBeenCalledWith(
                sourceUuid,
            );
        });
    });
});
