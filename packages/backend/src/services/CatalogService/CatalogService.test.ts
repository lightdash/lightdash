import { Ability } from '@casl/ability';
import {
    CatalogType,
    ForbiddenError,
    LightdashMode,
    OrganizationMemberRole,
    PossibleAbilities,
    SessionUser,
    type CatalogTable,
    type UserAttributeValueMap,
} from '@lightdash/common';
import { analyticsMock } from '../../analytics/LightdashAnalytics.mock';
import { LightdashConfig } from '../../config/parseConfig';
import {
    CatalogModel,
    CatalogSearchContext,
} from '../../models/CatalogModel/CatalogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import {
    tablesConfiguration,
    validExplore,
} from '../ProjectService/ProjectService.mock';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import { CatalogService } from './CatalogService';

const PROJECT_UUID = 'project-uuid';
const ORG_UUID = 'org-uuid';
const TREE_UUID = 'tree-uuid';
const USER_ATTRIBUTES = {
    region: ['emea'],
} satisfies UserAttributeValueMap;

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
    avatarUrl: null,
    avatarGradient: null,
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

const buildCatalogUser = (canViewProject: boolean): SessionUser => ({
    ...buildUser(false),
    ability: new Ability<PossibleAbilities>(
        canViewProject
            ? [
                  {
                      subject: 'Project',
                      action: 'view',
                      conditions: { projectUuid: PROJECT_UUID },
                  },
              ]
            : [],
    ),
});

const buildService = (overrides?: {
    projectModel?: Partial<ProjectModel>;
    catalogModel?: Partial<CatalogModel>;
    userAttributesModel?: Partial<UserAttributesModel>;
}) => {
    const projectModel = {
        getSummary: vi.fn(async () => ({
            organizationUuid: ORG_UUID,
            name: 'Test Project',
        })),
        findExploresFromCache: vi.fn(async () => ({
            [validExplore.name]: validExplore,
        })),
        getCachedExploreStorageBytes: vi.fn(async () => 1),
        getTablesConfiguration: vi.fn(async () => tablesConfiguration),
        ...overrides?.projectModel,
    } as unknown as ProjectModel;

    const catalogModel = {
        acquireTreeLock: vi.fn(async () => ({
            metricsTreeUuid: TREE_UUID,
            lockedByUserUuid: 'user-uuid',
            expiresAt: new Date(Date.now() + 60_000),
        })),
        refreshTreeLockHeartbeat: vi.fn(async () => true),
        releaseTreeLock: vi.fn(async () => undefined),
        getTreeLock: vi.fn(async () => null),
        updateMetricsTree: vi.fn(async () => ({})),
        deleteMetricsTree: vi.fn(async () => undefined),
        search: vi.fn(async () => ({ data: [] })),
        ...overrides?.catalogModel,
    } as unknown as CatalogModel;

    const userAttributesModel = {
        getAttributeValuesForOrgMember: vi.fn(async () => USER_ATTRIBUTES),
        ...overrides?.userAttributesModel,
    } as unknown as UserAttributesModel;

    const service = new CatalogService({
        lightdashConfig: { mode: LightdashMode.DEFAULT } as LightdashConfig,
        analytics: analyticsMock,
        projectModel,
        catalogModel,
        userAttributesModel,
        savedChartModel: {} as SavedChartModel,
        spaceModel: {} as SpaceModel,
        tagsModel: {} as TagsModel,
        spacePermissionService: {} as SpacePermissionService,
    });

    return { service, projectModel, catalogModel, userAttributesModel };
};

describe('CatalogService.getCatalog', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('searches without reading all cached explores and preserves search inputs', async () => {
        const catalogTable = {
            name: 'orders',
            label: 'Orders',
            catalogSearchUuid: 'catalog-search-uuid',
            type: CatalogType.Table,
            categories: [],
            chartUsage: undefined,
            icon: null,
            aiHints: null,
            joinedTables: null,
        } satisfies CatalogTable;
        const searchResult = {
            data: [catalogTable],
            pagination: {
                page: 1,
                pageSize: 50,
                totalPageCount: 1,
                totalResults: 1,
            },
        };
        const { service, projectModel, catalogModel, userAttributesModel } =
            buildService({
                catalogModel: {
                    search: vi.fn(async () => searchResult),
                },
            });
        const catalogSearch = {
            searchQuery: 'orders',
            type: CatalogType.Table,
        };

        const result = await service.getCatalog(
            buildCatalogUser(true),
            PROJECT_UUID,
            catalogSearch,
            CatalogSearchContext.CATALOG,
        );

        expect(result).toEqual(searchResult);
        expect(
            vi.mocked(projectModel.findExploresFromCache),
        ).not.toHaveBeenCalled();
        expect(
            vi.mocked(projectModel.getCachedExploreStorageBytes),
        ).not.toHaveBeenCalled();
        expect(
            vi.mocked(userAttributesModel.getAttributeValuesForOrgMember),
        ).toHaveBeenCalledTimes(1);
        expect(
            vi.mocked(userAttributesModel.getAttributeValuesForOrgMember),
        ).toHaveBeenCalledWith({
            organizationUuid: ORG_UUID,
            userUuid: 'user-uuid',
        });
        expect(vi.mocked(catalogModel.search)).toHaveBeenCalledWith({
            projectUuid: PROJECT_UUID,
            catalogSearch,
            paginateArgs: { page: 1, pageSize: 50 },
            userAttributes: USER_ATTRIBUTES,
            sortArgs: undefined,
            context: CatalogSearchContext.CATALOG,
            tablesConfiguration,
            excludeUnmatched: undefined,
            fullTextSearchOperator: undefined,
            filteredExplores: undefined,
        });
    });

    it.each([
        { type: CatalogType.Table },
        { searchQuery: '', type: CatalogType.Table },
    ])('browses cached explores for %#', async (catalogSearch) => {
        const { service, projectModel, catalogModel, userAttributesModel } =
            buildService();

        const result = await service.getCatalog(
            buildCatalogUser(true),
            PROJECT_UUID,
            catalogSearch,
            CatalogSearchContext.CATALOG,
        );

        expect(result.data.map(({ name }) => name)).toEqual([
            validExplore.name,
        ]);
        expect(
            vi.mocked(projectModel.findExploresFromCache),
        ).toHaveBeenCalledWith(PROJECT_UUID, 'name');
        expect(
            vi.mocked(projectModel.getCachedExploreStorageBytes),
        ).toHaveBeenCalledWith(PROJECT_UUID);
        expect(
            vi.mocked(userAttributesModel.getAttributeValuesForOrgMember),
        ).toHaveBeenCalledTimes(2);
        expect(vi.mocked(catalogModel.search)).not.toHaveBeenCalled();
    });

    it('denies access before reading user attributes or catalog data', async () => {
        const { service, projectModel, catalogModel, userAttributesModel } =
            buildService();

        await expect(
            service.getCatalog(
                buildCatalogUser(false),
                PROJECT_UUID,
                { searchQuery: 'orders', type: CatalogType.Table },
                CatalogSearchContext.CATALOG,
            ),
        ).rejects.toThrow(ForbiddenError);

        expect(vi.mocked(projectModel.getSummary)).toHaveBeenCalledWith(
            PROJECT_UUID,
        );
        expect(
            vi.mocked(userAttributesModel.getAttributeValuesForOrgMember),
        ).not.toHaveBeenCalled();
        expect(
            vi.mocked(projectModel.findExploresFromCache),
        ).not.toHaveBeenCalled();
        expect(
            vi.mocked(projectModel.getCachedExploreStorageBytes),
        ).not.toHaveBeenCalled();
        expect(vi.mocked(catalogModel.search)).not.toHaveBeenCalled();
    });
});

describe('CatalogService tree-lock ability checks', () => {
    afterEach(() => {
        vi.clearAllMocks();
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
                    getTreeLock: vi.fn(async () => ({
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
                    getTreeLock: vi.fn(async () => ({
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
