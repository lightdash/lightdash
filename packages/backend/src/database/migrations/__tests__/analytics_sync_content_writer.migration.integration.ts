import {
    ContentType,
    DashboardTileTypes,
    DbtProjectType,
    DefaultSupportedDbtVersion,
    ForbiddenError,
    getContentAsCodePathFromLtreePath,
    getLtreePathFromContentAsCodePath,
    ProjectType,
    type DashboardAsCode,
} from '@lightdash/common';
import { analyticsMock } from '../../../analytics/LightdashAnalytics.mock';
import { analyticsContentAsCode } from '../../../analytics/systemExplores/sampleContent';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { createAnalyticsSyncUser } from '../../../ee/services/AnalyticsProjectService/analyticsSyncUser';
import { ModelRepository } from '../../../models/ModelRepository';
import { CoderService } from '../../../services/CoderService/CoderService';
import { DirectAccessFeatureGate } from '../../../services/DirectAccess/DirectAccessFeatureGate';
import { LicenseService } from '../../../services/LicenseService/LicenseService';
import { PromoteService } from '../../../services/PromoteService/PromoteService';
import { SpacePermissionService } from '../../../services/SpaceService/SpacePermissionService';
import {
    createMigratedDatabase,
    type MigratedDatabase,
} from '../../../testing/migratedDatabase';
import { UtilRepository } from '../../../utils/UtilRepository';

type ContentWriterDependencies = ConstructorParameters<typeof CoderService>[0];

const unusedDependency = <T extends object>(name: string): T =>
    new Proxy({} as T, {
        get: (_target, property) => {
            throw new Error(`Unexpected use of ${name}.${String(property)}`);
        },
    });

describe('analytics worker through the real content writer', () => {
    let migrated: MigratedDatabase;
    let models: ModelRepository;
    let coder: CoderService;

    beforeAll(async () => {
        migrated = await createMigratedDatabase();
        const utils = new UtilRepository({
            lightdashConfig: lightdashConfigMock,
        });
        models = new ModelRepository({
            database: migrated.database,
            lightdashConfig: lightdashConfigMock,
            utils,
        });
        const spacePermissionService = new SpacePermissionService({
            spaceModel: models.getSpaceModel(),
            spacePermissionModel: models.getSpacePermissionModel(),
            appAccessModel: models.getAppAccessModel(),
            documentAccessModel: models.getDocumentAccessModel(),
            dashboardAccessModel: models.getDashboardAccessModel(),
            savedChartAccessModel: models.getSavedChartAccessModel(),
            savedSqlAccessModel: models.getSavedSqlAccessModel(),
            directAccessFeatureGate: new DirectAccessFeatureGate(
                new LicenseService({ licenseKey: null }),
            ),
        });
        const promoteService = new PromoteService({
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            agentActionLogModel: models.getAgentActionLogModel(),
            projectModel: models.getProjectModel(),
            savedChartModel: models.getSavedChartModel(),
            savedSqlModel: models.getSavedSqlModel(),
            dashboardModel: models.getDashboardModel(),
            spaceModel: models.getSpaceModel(),
            spacePermissionService,
            warehouseConnectionModel: models.getWarehouseConnectionModel(),
            appModel: models.getAppModel(),
            getDocumentService: () => {
                throw new Error('This built-in fixture has no document tiles');
            },
        });
        // This path does not schedule deliveries or use direct-access policies.
        const dependencies = {
            lightdashConfig: lightdashConfigMock,
            analytics: analyticsMock,
            agentActionLogModel: models.getAgentActionLogModel(),
            projectModel: models.getProjectModel(),
            savedChartModel: models.getSavedChartModel(),
            savedSqlModel: models.getSavedSqlModel(),
            appModel: models.getAppModel(),
            dashboardModel: models.getDashboardModel(),
            spaceModel: models.getSpaceModel(),
            schedulerModel: models.getSchedulerModel(),
            schedulerService:
                unusedDependency<ContentWriterDependencies['schedulerService']>(
                    'schedulerService',
                ),
            savedChartService:
                unusedDependency<
                    ContentWriterDependencies['savedChartService']
                >('savedChartService'),
            dashboardService:
                unusedDependency<ContentWriterDependencies['dashboardService']>(
                    'dashboardService',
                ),
            schedulerClient:
                unusedDependency<ContentWriterDependencies['schedulerClient']>(
                    'schedulerClient',
                ),
            directAccessService: unusedDependency<
                ContentWriterDependencies['directAccessService']
            >('directAccessService'),
            promoteService,
            spacePermissionService,
            contentAsCodeSnapshotModel: models.getContentAsCodeSnapshotModel(),
            contentAsCodeProjectSettingsModel:
                models.getContentAsCodeProjectSettingsModel(),
            contentVerificationModel: models.getContentVerificationModel(),
            groupsModel: models.getGroupsModel(),
            organizationMemberProfileModel:
                models.getOrganizationMemberProfileModel(),
            userModel: models.getUserModel(),
            warehouseConnectionModel: models.getWarehouseConnectionModel(),
        } satisfies ContentWriterDependencies;
        coder = new CoderService(dependencies);
    });

    afterAll(async () => {
        await migrated?.destroy();
    });

    const createProject = async () => {
        const [organization] = await migrated
            .database('organizations')
            .insert({ organization_name: 'Managed analytics content writer' })
            .returning('*');
        const [project] = await migrated
            .database('projects')
            .insert({
                name: 'Managed analytics',
                organization_id: organization.organization_id,
                project_type: ProjectType.DEFAULT,
                provisioning_source: 'analytics',
                dbt_connection_type: DbtProjectType.NONE,
                dbt_connection: new UtilRepository({
                    lightdashConfig: lightdashConfigMock,
                })
                    .getEncryptionUtil()
                    .encrypt(JSON.stringify({ type: DbtProjectType.NONE })),
                dbt_version: DefaultSupportedDbtVersion,
                copied_from_project_uuid: null,
                organization_warehouse_credentials_uuid: null,
                created_by_user_uuid: null,
            })
            .returning('*');
        return { organization, project };
    };

    it('reuses one credential-free worker under concurrent requests and rejects altered identities', async () => {
        const { project } = await createProject();
        const userModel = models.getUserModel();
        const [first, second] = await Promise.all([
            userModel.getOrCreateAnalyticsSystemUser(project.project_uuid),
            userModel.getOrCreateAnalyticsSystemUser(project.project_uuid),
        ]);
        expect(second).toEqual(first);
        expect(
            await userModel.getOrCreateAnalyticsSystemUser(
                project.project_uuid,
            ),
        ).toEqual(first);
        expect(
            await migrated.database('users').where('user_uuid', first.userUuid),
        ).toHaveLength(1);
        expect(
            await migrated
                .database('users')
                .where('user_uuid', first.userUuid)
                .first(),
        ).toMatchObject({
            first_name: 'Analytics system',
            is_active: false,
            is_internal: true,
        });
        await Promise.all(
            [
                'emails',
                'password_logins',
                'openid_identities',
                'organization_memberships',
                'project_memberships',
            ].map(async (table) => {
                expect(
                    await migrated
                        .database(table)
                        .where('user_id', first.userId),
                ).toEqual([]);
            }),
        );
        expect(
            await migrated
                .database('personal_access_tokens')
                .where('created_by_user_id', first.userId),
        ).toEqual([]);
        expect(
            await migrated
                .database('service_accounts')
                .where('service_account_user_uuid', first.userUuid),
        ).toEqual([]);
        await migrated
            .database('users')
            .where('user_uuid', first.userUuid)
            .update({ first_name: 'Unexpected identity' });
        await expect(
            userModel.getOrCreateAnalyticsSystemUser(project.project_uuid),
        ).rejects.toThrow('Analytics system user is invalid');
    });

    it('resolves and pages only marked analytics projects in the requested organization', async () => {
        const source = await createProject();
        const target = await createProject();
        const projectModel = models.getProjectModel();
        const expected = {
            projectUuid: target.project.project_uuid,
            organizationUuid: target.organization.organization_uuid,
            organizationName: target.organization.organization_name,
        };
        expect(
            await projectModel.getAnalyticsProject(target.project.project_uuid),
        ).toEqual(expected);
        expect(
            await projectModel.getAnalyticsProjectsPage({
                organizationUuid: target.organization.organization_uuid,
                afterProjectUuid: null,
                limit: 1,
            }),
        ).toEqual([expected]);
        expect(
            await projectModel.getAnalyticsProjectsPage({
                organizationUuid: target.organization.organization_uuid,
                afterProjectUuid: target.project.project_uuid,
                limit: 1,
            }),
        ).toEqual([]);
        await migrated
            .database('projects')
            .where('project_uuid', source.project.project_uuid)
            .update({ provisioning_source: null });
        expect(
            await projectModel.getAnalyticsProject(source.project.project_uuid),
        ).toBeNull();
        expect(
            await projectModel.getAnalyticsProjectsPage({
                organizationUuid: source.organization.organization_uuid,
                afterProjectUuid: null,
                limit: 1,
            }),
        ).toEqual([]);
        await expect(
            models
                .getUserModel()
                .getOrCreateAnalyticsSystemUser(source.project.project_uuid),
        ).rejects.toThrow('Analytics project not found');
    });

    it('creates and updates managed content in a restricted space with real permissions and worker attribution', async () => {
        const { project, organization } = await createProject();
        const bundle = analyticsContentAsCode[0];
        const chart = bundle.charts[0];
        const tile = bundle.dashboard.tiles.find(
            (candidate) =>
                candidate.type === DashboardTileTypes.SAVED_CHART &&
                candidate.properties.chartSlug === chart.slug,
        );
        if (!tile) throw new Error('Managed chart has no dashboard tile');
        const dashboard: DashboardAsCode = {
            ...bundle.dashboard,
            tiles: [tile],
            filters: { dimensions: [], metrics: [], tableCalculations: [] },
        };
        const [space] = await migrated
            .database('spaces')
            .insert({
                project_id: project.project_id,
                name: 'Restricted managed dashboards',
                slug: 'restricted-managed-dashboards',
                path: getLtreePathFromContentAsCodePath(dashboard.spaceSlug),
                parent_space_uuid: null,
                inherit_parent_permissions: false,
                is_default_user_space: false,
            })
            .returning('*');
        const user = createAnalyticsSyncUser({
            ...(await models
                .getUserModel()
                .getOrCreateAnalyticsSystemUser(project.project_uuid)),
            organizationUuid: organization.organization_uuid,
            organizationName: organization.organization_name,
            projectUuid: project.project_uuid,
        });
        const spaceSlug = getContentAsCodePathFromLtreePath(space.path);
        const options = {
            spaceNames: { [spaceSlug]: space.name },
            publicSpaceCreate: true,
            force: true,
            syncEnabled: false,
        };
        await coder.upsertDashboard(
            user,
            project.project_uuid,
            dashboard.slug,
            { ...dashboard, verified: false, tiles: [] },
            options,
        );
        await coder.upsertChart(
            user,
            project.project_uuid,
            chart.slug,
            chart,
            options,
        );
        await coder.upsertDashboard(
            user,
            project.project_uuid,
            dashboard.slug,
            dashboard,
            options,
        );
        const installedChart = await models
            .getSavedChartModel()
            .get(chart.slug, undefined, { projectUuid: project.project_uuid });
        const installedDashboard = await models
            .getDashboardModel()
            .getByIdOrSlug(dashboard.slug, {
                projectUuid: project.project_uuid,
            });
        expect(installedChart.dashboardUuid).toBe(installedDashboard.uuid);
        expect(installedDashboard.spaceUuid).toBe(space.space_uuid);
        expect(installedDashboard.tiles).toHaveLength(1);
        expect(
            await models
                .getContentVerificationModel()
                .getByContent(ContentType.DASHBOARD, installedDashboard.uuid),
        ).toMatchObject({
            verifiedBy: {
                userUuid: user.userUuid,
                firstName: 'Analytics system',
            },
        });

        await coder.upsertChart(
            user,
            project.project_uuid,
            chart.slug,
            { ...chart, name: 'Updated managed chart' },
            options,
        );
        await coder.upsertDashboard(
            user,
            project.project_uuid,
            dashboard.slug,
            { ...dashboard, name: 'Updated managed dashboard' },
            options,
        );
        const updatedChart = await models
            .getSavedChartModel()
            .get(installedChart.uuid);
        const updatedDashboard = await models
            .getDashboardModel()
            .getByIdOrSlug(installedDashboard.uuid);
        expect(updatedChart.uuid).toBe(installedChart.uuid);
        expect(updatedChart.name).toBe('Updated managed chart');
        expect(updatedChart.dashboardUuid).toBe(installedDashboard.uuid);
        expect(updatedChart.updatedByUser).toMatchObject({
            userUuid: user.userUuid,
        });
        expect(updatedDashboard.name).toBe('Updated managed dashboard');
        expect(updatedDashboard.spaceUuid).toBe(space.space_uuid);
        expect(
            await migrated
                .database('spaces')
                .where('space_uuid', space.space_uuid)
                .first('inherit_parent_permissions'),
        ).toEqual({ inherit_parent_permissions: false });
        expect(
            await migrated
                .database('organization_memberships')
                .where('user_id', user.userId),
        ).toEqual([]);
        expect(
            await migrated
                .database('space_user_access')
                .where('user_uuid', user.userUuid),
        ).toEqual([]);
    });

    it('rejects a different project before the content writer persists anything', async () => {
        const source = await createProject();
        const target = await createProject();
        const user = createAnalyticsSyncUser({
            ...(await models
                .getUserModel()
                .getOrCreateAnalyticsSystemUser(source.project.project_uuid)),
            organizationUuid: source.organization.organization_uuid,
            organizationName: source.organization.organization_name,
            projectUuid: source.project.project_uuid,
        });
        const { dashboard, charts } = analyticsContentAsCode[0];
        await expect(
            coder.upsertChart(
                user,
                target.project.project_uuid,
                charts[0].slug,
                charts[0],
                { syncEnabled: false },
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        await expect(
            coder.upsertDashboard(
                user,
                target.project.project_uuid,
                dashboard.slug,
                { ...dashboard, tiles: [] },
                { syncEnabled: false },
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(
            await migrated
                .database('saved_queries')
                .where('project_uuid', target.project.project_uuid),
        ).toEqual([]);
        expect(
            await models
                .getDashboardModel()
                .find({ projectUuid: target.project.project_uuid }),
        ).toEqual([]);
    });
});
