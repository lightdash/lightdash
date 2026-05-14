/* eslint-disable @typescript-eslint/dot-notation */
import {
    AnyType,
    DbtProjectType,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ServiceAccountScope,
    SessionUser,
    SupportedDbtVersions,
    WarehouseTypes,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { getUpdateSetupConfig } from '../../config/parseConfig';
import { InstanceConfigurationService } from './InstanceConfigurationService';

// Mock data
const mockOrgUuid = 'org-123';
const mockProjectUuid = 'project-456';
const mockUserId = 'user-789';
const mockAdminEmail = 'admin@example.com';

const mockSessionUser: SessionUser = {
    userUuid: mockUserId,
    userId: 1,
    email: mockAdminEmail,
    firstName: 'Admin',
    lastName: 'User',
    organizationUuid: mockOrgUuid,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isActive: true,
    isSetupComplete: true,
    role: OrganizationMemberRole.ADMIN,
    ability: {} as AnyType,
    abilityRules: {} as AnyType,
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const mockProject = {
    projectUuid: mockProjectUuid,
    name: 'Test Project',
    type: 'default',
    organizationUuid: mockOrgUuid,
    dbtConnection: {
        type: DbtProjectType.GITHUB,
        authorization_method: 'personal_access_token',
        personal_access_token: 'old-token',
        repository: 'test/repo',
        branch: 'main',
        project_sub_path: '/',
    },
    warehouseConnection: {
        type: WarehouseTypes.DATABRICKS,
        serverHostName: 'test.databricks.com',
        httpPath: '/sql/1.0/warehouses/old-warehouse',
        catalog: 'test_catalog',
        database: 'test_database',
        personalAccessToken: 'old-warehouse-token',
    },
    dbtVersion: SupportedDbtVersions.V1_4,
};

const createMockService = (overrides: AnyType = {}) => {
    const organizationModel = {
        getOrgUuids: jest.fn(),
        ...overrides.organizationModel,
    };

    const projectModel = {
        getDefaultProjectUuids: jest.fn(),
        getDefaultProjectUuidsByName: jest.fn(),
        getWithSensitiveFields: jest.fn(),
        update: jest.fn(),
        ...overrides.projectModel,
    };

    const userModel = {
        findSessionUserByPrimaryEmail: jest.fn(),
        ...overrides.userModel,
    };

    const personalAccessTokenModel = {
        deleteAllTokensForUser: jest.fn(),
        save: jest.fn(),
        ...overrides.personalAccessTokenModel,
    };

    const serviceAccountModel = {
        save: jest.fn(),
        ...overrides.serviceAccountModel,
    };

    const lightdashConfig = {
        ...lightdashConfigMock,
        updateSetup: overrides.updateSetup || undefined,
    };

    return new InstanceConfigurationService({
        lightdashConfig,
        analytics: analyticsMock,
        organizationModel: organizationModel as AnyType,
        projectModel: projectModel as AnyType,
        userModel: userModel as AnyType,
        organizationAllowedEmailDomainsModel: {} as AnyType,
        personalAccessTokenModel: personalAccessTokenModel as AnyType,
        emailModel: {} as AnyType,
        projectService: {
            scheduleCompileProject: jest.fn(),
            ...overrides.projectService,
        } as AnyType,
        serviceAccountModel: serviceAccountModel as AnyType,
        embedModel: {} as AnyType,
        encryptionUtil: { encrypt: jest.fn() } as AnyType,
    });
};

describe('InstanceConfigurationService.updateInstanceConfiguration', () => {
    let service: InstanceConfigurationService;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('validation scenarios', () => {
        test('Do not throw error with default update setup config', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest
                        .fn()
                        .mockResolvedValue(['org-1', 'org-2']),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue(['project-1', 'project-2']),
                },
                updateSetup: getUpdateSetupConfig(),
            });

            await expect(
                service.updateInstanceConfiguration(),
            ).resolves.not.toThrow();
        });

        test('should throw ParameterError when there are multiple organizations and I am updating service account', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest
                        .fn()
                        .mockResolvedValue(['org-1', 'org-2']),
                },
                updateSetup: {
                    serviceAccount: {
                        token: 'new-service-account-token',
                        expirationTime: new Date('2025-12-31'),
                    },
                },
            });

            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                ParameterError,
            );
            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                'There must be exactly 1 organization to update instance configuration',
            );
        });

        test('should throw ParameterError when there are multiple projects and I am updating project configuration', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue(['project-1', 'project-2']),
                },
                updateSetup: {
                    project: {
                        dbtVersion: SupportedDbtVersions.V1_5,
                    },
                },
            });

            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                ParameterError,
            );
            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                'There must be exactly 1 project to update instance configuration',
            );
        });
    });

    describe('API key update scenarios', () => {
        test('should update API key for admin user when both token and email are provided', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                },
                userModel: {
                    findSessionUserByPrimaryEmail: jest
                        .fn()
                        .mockResolvedValue(mockSessionUser),
                },
                personalAccessTokenModel: {
                    deleteAllTokensForUser: jest
                        .fn()
                        .mockResolvedValue(undefined),
                    save: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: {
                    organization: {
                        admin: {
                            email: mockAdminEmail,
                        },
                    },
                    apiKey: {
                        token: 'new-api-token',
                        expirationTime: new Date('2025-12-31'),
                    },
                },
            });

            await service.updateInstanceConfiguration();

            expect(
                service['userModel'].findSessionUserByPrimaryEmail,
            ).toHaveBeenCalledWith(mockAdminEmail);
            expect(
                service['personalAccessTokenModel'].deleteAllTokensForUser,
            ).toHaveBeenCalledWith(mockSessionUser.userId);
            expect(
                service['personalAccessTokenModel'].save,
            ).toHaveBeenCalledWith(mockSessionUser, {
                expiresAt: new Date('2025-12-31'),
                description: 'Updated API token',
                autoGenerated: false,
                token: 'new-api-token',
            });
        });

        test('should throw NotFoundError when admin user is not found', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                },
                userModel: {
                    findSessionUserByPrimaryEmail: jest
                        .fn()
                        .mockResolvedValue(null),
                },
                updateSetup: {
                    organization: {
                        admin: {
                            email: mockAdminEmail,
                        },
                    },
                    apiKey: {
                        token: 'new-api-token',
                        expirationTime: new Date('2025-12-31'),
                    },
                },
            });

            await expect(
                service.updateInstanceConfiguration(),
            ).resolves.not.toThrow();

            expect(
                service['personalAccessTokenModel'].save,
            ).not.toHaveBeenCalled();
        });
    });

    describe('service account update scenarios', () => {
        test('should update service account when service account model is available', async () => {
            const mockExistingServiceAccounts = [
                { uuid: 'sa-1', description: 'Old service account 1' },
                { uuid: 'sa-2', description: 'Old service account 2' },
            ];

            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                },
                serviceAccountModel: {
                    getAllForOrganization: jest
                        .fn()
                        .mockResolvedValue(mockExistingServiceAccounts),
                    delete: jest.fn().mockResolvedValue(undefined),
                    save: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: {
                    serviceAccount: {
                        token: 'new-service-account-token',
                        expirationTime: new Date('2025-12-31'),
                    },
                },
            });

            await service.updateInstanceConfiguration();

            expect(
                service['serviceAccountModel']?.getAllForOrganization,
            ).toHaveBeenCalledWith(mockOrgUuid, [
                ServiceAccountScope.ORG_ADMIN,
            ]);

            expect(service['serviceAccountModel']?.delete).toHaveBeenCalledWith(
                'sa-1',
            );
            expect(service['serviceAccountModel']?.delete).toHaveBeenCalledWith(
                'sa-2',
            );

            expect(service['serviceAccountModel']?.save).toHaveBeenCalledWith(
                undefined,
                {
                    organizationUuid: mockOrgUuid,
                    expiresAt: new Date('2025-12-31'),
                    description: 'Updated service account',
                    scopes: [ServiceAccountScope.ORG_ADMIN],
                },
                'new-service-account-token',
            );
        });
    });

    describe('project configuration update scenarios', () => {
        test('should update dbt personal access token only', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockResolvedValue(mockProject),
                    update: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: {
                    dbt: {
                        personal_access_token: 'new-dbt-token',
                    },
                },
            });

            await service.updateInstanceConfiguration();

            expect(
                service['projectModel'].getWithSensitiveFields,
            ).toHaveBeenCalledWith(mockProjectUuid);
            expect(service['projectModel'].update).toHaveBeenCalledWith(
                mockProjectUuid,
                {
                    ...mockProject,
                    warehouseConnection: {
                        ...mockProject.warehouseConnection,
                        httpPath: mockProject.warehouseConnection.httpPath,
                    },
                    dbtVersion: mockProject.dbtVersion,
                    dbtConnection: {
                        ...mockProject.dbtConnection,
                        personal_access_token: 'new-dbt-token',
                    },
                },
            );
        });

        test('should update all project configuration properties', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockResolvedValue(mockProject),
                    update: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: {
                    organization: {},
                    dbt: {
                        personal_access_token: 'new-dbt-token',
                    },
                    project: {
                        httpPath: '/sql/1.0/warehouses/new-warehouse',
                        dbtVersion: SupportedDbtVersions.V1_5,
                    },
                },
            });

            await service.updateInstanceConfiguration();

            expect(service['projectModel'].update).toHaveBeenCalledWith(
                mockProjectUuid,
                {
                    ...mockProject,
                    warehouseConnection: {
                        ...mockProject.warehouseConnection,
                        httpPath: '/sql/1.0/warehouses/new-warehouse',
                    },
                    dbtVersion: SupportedDbtVersions.V1_5,
                    dbtConnection: {
                        ...mockProject.dbtConnection,
                        personal_access_token: 'new-dbt-token',
                    },
                },
            );
        });
    });

    describe('edge cases and error scenarios', () => {
        test('should throw ParameterError when project is not a git project', async () => {
            const nonGitProject = {
                ...mockProject,
                dbtConnection: {
                    type: 'local',
                    project_dir: '/path/to/project',
                },
            };

            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockResolvedValue(nonGitProject),
                },
                updateSetup: {
                    dbt: {
                        personal_access_token: 'new-token',
                    },
                },
            });

            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                ParameterError,
            );
            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                `Project ${mockProjectUuid} is not a git project`,
            );
        });

        test('should throw ParameterError when project has no warehouse connection', async () => {
            const projectWithoutWarehouse = {
                ...mockProject,
                warehouseConnection: undefined,
            };

            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockResolvedValue(projectWithoutWarehouse),
                },
                updateSetup: {
                    project: {
                        httpPath: '/new/path',
                    },
                },
            });

            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                ParameterError,
            );
            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                `Project ${mockProjectUuid} has no warehouse connection`,
            );
        });

        test('should handle empty updateSetup configuration', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                },
                updateSetup: {},
            });

            await expect(
                service.updateInstanceConfiguration(),
            ).resolves.not.toThrow();
        });

        test('should allow non-git project to be updated with warehouse configuration only', async () => {
            const nonGitProject = {
                ...mockProject,
                dbtConnection: {
                    type: 'local',
                    project_dir: '/path/to/project',
                },
            };

            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockResolvedValue(nonGitProject),
                    update: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: {
                    project: {
                        httpPath: '/sql/1.0/warehouses/new-warehouse',
                        dbtVersion: SupportedDbtVersions.V1_5,
                    },
                },
            });

            await expect(
                service.updateInstanceConfiguration(),
            ).resolves.not.toThrow();

            expect(service['projectModel'].update).toHaveBeenCalledWith(
                mockProjectUuid,
                {
                    ...nonGitProject,
                    warehouseConnection: {
                        ...nonGitProject.warehouseConnection,
                        httpPath: '/sql/1.0/warehouses/new-warehouse',
                    },
                    dbtVersion: SupportedDbtVersions.V1_5,
                    dbtConnection: {
                        ...nonGitProject.dbtConnection,
                    },
                },
            );
        });
    });

    describe('integration scenarios', () => {
        test('should handle complete update scenario with all components', async () => {
            const mockExistingServiceAccounts = [
                { uuid: 'sa-1', description: 'Old service account 1' },
            ];

            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockResolvedValue(mockProject),
                    update: jest.fn().mockResolvedValue(undefined),
                },
                userModel: {
                    findSessionUserByPrimaryEmail: jest
                        .fn()
                        .mockResolvedValue(mockSessionUser),
                },
                personalAccessTokenModel: {
                    deleteAllTokensForUser: jest
                        .fn()
                        .mockResolvedValue(undefined),
                    save: jest.fn().mockResolvedValue(undefined),
                },
                serviceAccountModel: {
                    getAllForOrganization: jest
                        .fn()
                        .mockResolvedValue(mockExistingServiceAccounts),
                    delete: jest.fn().mockResolvedValue(undefined),
                    save: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: {
                    organization: {
                        admin: {
                            email: mockAdminEmail,
                        },
                    },
                    apiKey: {
                        token: 'new-api-token',
                        expirationTime: new Date('2025-12-31'),
                    },
                    serviceAccount: {
                        token: 'new-service-account-token',
                        expirationTime: new Date('2025-12-31'),
                    },
                    dbt: {
                        personal_access_token: 'new-dbt-token',
                    },
                    project: {
                        httpPath: '/sql/1.0/warehouses/new-warehouse',
                        dbtVersion: SupportedDbtVersions.V1_5,
                    },
                },
            });

            await service.updateInstanceConfiguration();

            // Verify all components were updated
            expect(
                service['userModel'].findSessionUserByPrimaryEmail,
            ).toHaveBeenCalledWith(mockAdminEmail);
            expect(
                service['personalAccessTokenModel'].deleteAllTokensForUser,
            ).toHaveBeenCalledWith(mockSessionUser.userId);
            expect(
                service['personalAccessTokenModel'].save,
            ).toHaveBeenCalledWith(mockSessionUser, {
                expiresAt: new Date('2025-12-31'),
                description: 'Updated API token',
                autoGenerated: false,
                token: 'new-api-token',
            });

            expect(
                service['serviceAccountModel']?.getAllForOrganization,
            ).toHaveBeenCalledWith(mockOrgUuid, [
                ServiceAccountScope.ORG_ADMIN,
            ]);

            expect(service['serviceAccountModel']?.delete).toHaveBeenCalledWith(
                'sa-1',
            );

            expect(service['serviceAccountModel']?.save).toHaveBeenCalledWith(
                undefined,
                {
                    organizationUuid: mockOrgUuid,
                    expiresAt: new Date('2025-12-31'),
                    description: 'Updated service account',
                    scopes: [ServiceAccountScope.ORG_ADMIN],
                },
                'new-service-account-token',
            );

            expect(service['projectModel'].update).toHaveBeenCalledWith(
                mockProjectUuid,
                {
                    ...mockProject,
                    warehouseConnection: {
                        ...mockProject.warehouseConnection,
                        httpPath: '/sql/1.0/warehouses/new-warehouse',
                    },
                    dbtVersion: SupportedDbtVersions.V1_5,
                    dbtConnection: {
                        ...mockProject.dbtConnection,
                        personal_access_token: 'new-dbt-token',
                    },
                },
            );
        });
    });

    describe('multi-project configuration update scenarios', () => {
        const multiProjectSetup = [
            {
                name: 'Project Alpha',
                warehouseConnection: {
                    type: WarehouseTypes.DATABRICKS,
                    serverHostName: 'alpha.databricks.com',
                    httpPath: '/sql/1.0/warehouses/alpha',
                    catalog: 'alpha_catalog',
                    database: 'alpha_db',
                    personalAccessToken: 'alpha-token',
                },
                dbtConnection: {
                    type: DbtProjectType.GITHUB,
                    authorization_method: 'personal_access_token',
                    personal_access_token: 'alpha-dbt-token',
                    repository: 'org/alpha-repo',
                    branch: 'main',
                    project_sub_path: '/',
                },
            },
            {
                name: 'Project Beta',
                warehouseConnection: {
                    type: WarehouseTypes.DATABRICKS,
                    serverHostName: 'beta.databricks.com',
                    httpPath: '/sql/1.0/warehouses/beta',
                    catalog: 'beta_catalog',
                    database: 'beta_db',
                    personalAccessToken: 'beta-token',
                },
                dbtConnection: {
                    type: DbtProjectType.GITHUB,
                    authorization_method: 'personal_access_token',
                    personal_access_token: 'beta-dbt-token',
                    repository: 'org/beta-repo',
                    branch: 'main',
                    project_sub_path: '/',
                },
            },
        ];

        test('should update multiple projects matched by name', async () => {
            const mockAlphaProject = {
                ...mockProject,
                name: 'Project Alpha',
                projectUuid: 'alpha-uuid',
            };
            const mockBetaProject = {
                ...mockProject,
                name: 'Project Beta',
                projectUuid: 'beta-uuid',
            };

            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getDefaultProjectUuidsByName: jest
                        .fn()
                        .mockImplementation((name: string) => {
                            if (name === 'Project Alpha')
                                return Promise.resolve(['alpha-uuid']);
                            if (name === 'Project Beta')
                                return Promise.resolve(['beta-uuid']);
                            return Promise.resolve([]);
                        }),
                    getWithSensitiveFields: jest
                        .fn()
                        .mockImplementation((uuid: string) => {
                            if (uuid === 'alpha-uuid')
                                return Promise.resolve(mockAlphaProject);
                            if (uuid === 'beta-uuid')
                                return Promise.resolve(mockBetaProject);
                            return Promise.reject(
                                new Error('Project not found'),
                            );
                        }),
                    update: jest.fn().mockResolvedValue(undefined),
                },
                updateSetup: { projects: multiProjectSetup },
            });

            await service.updateInstanceConfiguration();

            expect(service['projectModel'].update).toHaveBeenCalledTimes(2);
            expect(service['projectModel'].update).toHaveBeenCalledWith(
                'alpha-uuid',
                expect.objectContaining({
                    warehouseConnection:
                        multiProjectSetup[0].warehouseConnection,
                    dbtConnection: multiProjectSetup[0].dbtConnection,
                }),
            );
            expect(service['projectModel'].update).toHaveBeenCalledWith(
                'beta-uuid',
                expect.objectContaining({
                    warehouseConnection:
                        multiProjectSetup[1].warehouseConnection,
                    dbtConnection: multiProjectSetup[1].dbtConnection,
                }),
            );
        });

        test('should throw ParameterError when multiple projects share the same name', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getDefaultProjectUuidsByName: jest
                        .fn()
                        .mockResolvedValue([
                            'duplicate-uuid-1',
                            'duplicate-uuid-2',
                        ]),
                },
                updateSetup: { projects: [multiProjectSetup[0]] },
            });

            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                ParameterError,
            );
            await expect(service.updateInstanceConfiguration()).rejects.toThrow(
                'Multiple projects found with name "Project Alpha"',
            );
        });

        test('should create projects not found by name', async () => {
            const newProjectUuid = 'new-project-uuid';
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                    getDefaultProjectUuidsByName: jest
                        .fn()
                        .mockResolvedValue([]),
                    create: jest.fn().mockResolvedValue(newProjectUuid),
                },
                userModel: {
                    findSessionUserByPrimaryEmail: jest
                        .fn()
                        .mockResolvedValue(mockSessionUser),
                },
                updateSetup: {
                    organization: {
                        admin: { email: mockAdminEmail },
                    },
                    projects: [multiProjectSetup[0]],
                },
            });

            await expect(
                service.updateInstanceConfiguration(),
            ).resolves.not.toThrow();

            expect(service['projectModel'].update).not.toHaveBeenCalled();
            expect(service['projectModel'].create).toHaveBeenCalledWith(
                mockUserId,
                mockOrgUuid,
                expect.objectContaining({
                    name: multiProjectSetup[0].name,
                }),
            );
        });

        test('should not update projects when projects is not configured', async () => {
            service = createMockService({
                organizationModel: {
                    getOrgUuids: jest.fn().mockResolvedValue([mockOrgUuid]),
                },
                projectModel: {
                    getDefaultProjectUuids: jest
                        .fn()
                        .mockResolvedValue([mockProjectUuid]),
                },
                updateSetup: {},
            });

            await service.updateInstanceConfiguration();

            expect(
                service['projectModel'].getDefaultProjectUuidsByName,
            ).not.toHaveBeenCalled();
        });
    });
});
