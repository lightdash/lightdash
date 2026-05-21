import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    LightdashMode,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionUser,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { LightdashConfig } from '../../config/parseConfig';
import { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ChangesetModel } from '../../models/ChangesetModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CatalogService } from './CatalogService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const TREE_UUID = 'tree-uuid';

const buildUser = (canManageMetricsTree: boolean): SessionUser => ({
    userUuid: 'user-uuid',
    email: 'user@example.com',
    firstName: 'Test',
    lastName: 'User',
    organizationUuid: ORG_UUID,
    organizationName: 'Test Org',
    organizationCreatedAt: new Date(),
    isTrackingAnonymized: false,
    isMarketingOptedIn: false,
    timezone: null,
    isSetupComplete: true,
    userId: 0,
    role: OrganizationMemberRole.ADMIN,
    ability: new Ability<PossibleAbilities>(
        canManageMetricsTree
            ? [
                  {
                      subject: 'MetricsTree',
                      action: ['manage', 'view'],
                      conditions: { projectUuid: PROJECT_UUID },
                  },
              ]
            : [],
    ),
    isActive: true,
    abilityRules: [],
    createdAt: new Date(),
    updatedAt: new Date(),
});

const buildService = (overrides?: { catalogModel?: Partial<CatalogModel> }) => {
    const projectModel = {
        getSummary: jest.fn(async () => ({
            organizationUuid: ORG_UUID,
            name: 'Test Project',
        })),
    } as unknown as ProjectModel;

    const catalogModel = {
        acquireTreeLock: jest.fn(async () => ({
            metricsTreeUuid: TREE_UUID,
            lockedByUserUuid: 'user-uuid',
            expiresAt: new Date(Date.now() + 60_000),
        })),
        refreshTreeLockHeartbeat: jest.fn(async () => true),
        releaseTreeLock: jest.fn(async () => undefined),
        getTreeLock: jest.fn(async () => null),
        updateMetricsTree: jest.fn(async () => ({})),
        deleteMetricsTree: jest.fn(async () => undefined),
        ...overrides?.catalogModel,
    } as unknown as CatalogModel;

    const service = new CatalogService({
        lightdashConfig: { mode: LightdashMode.DEFAULT } as LightdashConfig,
        analytics: analyticsMock,
        projectModel,
        catalogModel,
        userAttributesModel: {} as UserAttributesModel,
        savedChartModel: {} as SavedChartModel,
        spaceModel: {} as SpaceModel,
        tagsModel: {} as TagsModel,
        changesetModel: {} as ChangesetModel,
        spacePermissionService: {} as SpacePermissionService,
    });

    return { service, projectModel, catalogModel };
};

describe('CatalogService tree-lock ability checks', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('acquireTreeLock', () => {
        it('acquires when ability allows', async () => {
            const { service, catalogModel } = buildService();
            await service.acquireTreeLock(
                buildUser(true),
                PROJECT_UUID,
                TREE_UUID,
            );
            expect(catalogModel.acquireTreeLock).toHaveBeenCalledWith(
                TREE_UUID,
                'user-uuid',
            );
        });

        it('throws ForbiddenError when ability denies and does not touch the lock', async () => {
            const { service, catalogModel } = buildService();
            await expect(
                service.acquireTreeLock(
                    buildUser(false),
                    PROJECT_UUID,
                    TREE_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(catalogModel.acquireTreeLock).not.toHaveBeenCalled();
        });
    });

    describe('refreshTreeLockHeartbeat', () => {
        it('refreshes when ability allows', async () => {
            const { service, catalogModel } = buildService();
            await service.refreshTreeLockHeartbeat(
                buildUser(true),
                PROJECT_UUID,
                TREE_UUID,
            );
            expect(catalogModel.refreshTreeLockHeartbeat).toHaveBeenCalledWith(
                TREE_UUID,
                'user-uuid',
            );
        });

        it('throws ForbiddenError when ability denies', async () => {
            const { service, catalogModel } = buildService();
            await expect(
                service.refreshTreeLockHeartbeat(
                    buildUser(false),
                    PROJECT_UUID,
                    TREE_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(
                catalogModel.refreshTreeLockHeartbeat,
            ).not.toHaveBeenCalled();
        });
    });

    describe('releaseTreeLock', () => {
        it('releases when ability allows', async () => {
            const { service, catalogModel } = buildService();
            await service.releaseTreeLock(
                buildUser(true),
                PROJECT_UUID,
                TREE_UUID,
            );
            expect(catalogModel.releaseTreeLock).toHaveBeenCalledWith(
                TREE_UUID,
                'user-uuid',
            );
        });

        it('throws ForbiddenError when ability denies', async () => {
            const { service, catalogModel } = buildService();
            await expect(
                service.releaseTreeLock(
                    buildUser(false),
                    PROJECT_UUID,
                    TREE_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(catalogModel.releaseTreeLock).not.toHaveBeenCalled();
        });
    });

    describe('updateMetricsTree', () => {
        it('throws ForbiddenError on ability deny before inspecting the lock', async () => {
            const { service, catalogModel } = buildService();
            await expect(
                service.updateMetricsTree(
                    buildUser(false),
                    PROJECT_UUID,
                    TREE_UUID,
                    {
                        name: 'Tree',
                        description: undefined,
                        nodes: [],
                        edges: [],
                        expectedGeneration: 0,
                    },
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(catalogModel.getTreeLock).not.toHaveBeenCalled();
            expect(catalogModel.updateMetricsTree).not.toHaveBeenCalled();
        });

        it('throws when user does not hold the lock', async () => {
            const { service } = buildService({
                catalogModel: {
                    getTreeLock: jest.fn(async () => ({
                        metricsTreeUuid: TREE_UUID,
                        lockedByUserUuid: 'someone-else',
                        lockedByUserName: 'Someone Else',
                        acquiredAt: new Date(),
                        expiresAt: new Date(Date.now() + 60_000),
                    })),
                } as unknown as Partial<CatalogModel>,
            });
            await expect(
                service.updateMetricsTree(
                    buildUser(true),
                    PROJECT_UUID,
                    TREE_UUID,
                    {
                        name: 'Tree',
                        description: undefined,
                        nodes: [],
                        edges: [],
                        expectedGeneration: 0,
                    },
                ),
            ).rejects.toThrow(ForbiddenError);
        });
    });

    describe('deleteMetricsTree', () => {
        it('deletes when ability allows and no lock is held', async () => {
            const { service, catalogModel } = buildService();
            await service.deleteMetricsTree(
                buildUser(true),
                PROJECT_UUID,
                TREE_UUID,
            );
            expect(catalogModel.deleteMetricsTree).toHaveBeenCalledWith(
                PROJECT_UUID,
                TREE_UUID,
            );
        });

        it('throws ForbiddenError on ability deny', async () => {
            const { service, catalogModel } = buildService();
            await expect(
                service.deleteMetricsTree(
                    buildUser(false),
                    PROJECT_UUID,
                    TREE_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(catalogModel.deleteMetricsTree).not.toHaveBeenCalled();
        });

        it('throws when a foreign lock is held', async () => {
            const { service, catalogModel } = buildService({
                catalogModel: {
                    getTreeLock: jest.fn(async () => ({
                        metricsTreeUuid: TREE_UUID,
                        lockedByUserUuid: 'someone-else',
                        lockedByUserName: 'Someone Else',
                        acquiredAt: new Date(),
                        expiresAt: new Date(Date.now() + 60_000),
                    })),
                } as unknown as Partial<CatalogModel>,
            });
            await expect(
                service.deleteMetricsTree(
                    buildUser(true),
                    PROJECT_UUID,
                    TREE_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            expect(catalogModel.deleteMetricsTree).not.toHaveBeenCalled();
        });
    });
});
