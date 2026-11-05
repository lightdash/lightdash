import { OrganizationMemberRole, ProjectType } from '@lightdash/common';
import { type Knex } from 'knex';
import { ClientRepository } from '../../../clients/ClientRepository';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { ModelRepository } from '../../../models/ModelRepository';
import {
    OperationContext,
    ServiceRepository,
} from '../../../services/ServiceRepository';
import { UtilRepository } from '../../../utils/UtilRepository';
import {
    createMigratedTestDatabase,
    type MigratedTestDatabase,
} from './migratedTestDatabase';

/**
 * Learn on a self-hosted instance without an Enterprise license: only the
 * core migrations have run and the services are the core wiring, so any
 * step of the flow that reaches an Enterprise-only table fails here.
 */
describe('Learn on the community edition schema', () => {
    let migrated: MigratedTestDatabase;
    let database: Knex;
    let models: ModelRepository;
    let services: ServiceRepository;

    beforeAll(async () => {
        migrated = await createMigratedTestDatabase('learn_community', {
            edition: 'community',
        });
        database = migrated.database;
        const lightdashConfig = {
            ...lightdashConfigMock,
            license: {
                ...lightdashConfigMock.license,
                licenseKey: null,
            },
        };
        const context = new OperationContext({
            operationId: 'learn-community-test',
            lightdashAnalytics: { track: vi.fn() } as never,
            lightdashConfig,
        });
        const utils = new UtilRepository({ lightdashConfig });
        models = new ModelRepository({ lightdashConfig, database, utils });
        services = new ServiceRepository({
            context,
            clients: new ClientRepository({ context, models }),
            models,
            utils,
            prometheusMetrics: undefined,
        } as never);
    }, 600000);

    afterAll(async () => {
        await migrated?.destroy();
    });

    beforeEach(() => {
        vi.spyOn(models.getFeatureFlagModel(), 'get').mockImplementation(
            async ({ featureFlagId }) => ({ id: featureFlagId, enabled: true }),
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const createOrganizationAdmin = async () => {
        const [organization] = await database('organizations')
            .insert({ organization_name: 'Community edition' })
            .returning(['organization_id', 'organization_uuid']);
        const [user] = await database('users')
            .insert({
                first_name: 'Community',
                last_name: 'Admin',
                is_setup_complete: true,
                is_active: true,
            } as never)
            .returning(['user_id', 'user_uuid']);
        await database('emails').insert({
            user_id: user.user_id,
            email: `admin-${user.user_uuid}@example.com`,
            is_primary: true,
        } as never);
        await database('organization_memberships').insert({
            organization_id: organization.organization_id,
            user_id: user.user_id,
            role: OrganizationMemberRole.ADMIN,
        } as never);
        return models
            .getUserModel()
            .findSessionUserAndOrgByUuid(
                user.user_uuid,
                organization.organization_uuid,
            );
    };

    test('the schema has no Enterprise tables', async () => {
        expect(await database.schema.hasTable('ai_deep_research_runs')).toBe(
            false,
        );
        expect(await database.schema.hasTable('ai_agent')).toBe(false);
    });

    test('an admin enables Learn and starts a walkthrough, then starts one again', async () => {
        const projectService = services.getProjectService();
        const admin = await createOrganizationAdmin();

        const { projectUuid: trainingProjectUuid } =
            await projectService.enableLearn(admin);
        const learner = await models
            .getUserModel()
            .findSessionUserAndOrgByUuid(
                admin.userUuid,
                admin.organizationUuid!,
            );

        const first = await projectService.createTrainingPreview(
            learner,
            trainingProjectUuid,
        );
        const copy = await models.getProjectModel().get(first.projectUuid);
        expect(copy.type).toBe(ProjectType.PREVIEW);
        expect(copy.upstreamProjectUuid).toBe(trainingProjectUuid);
        expect(
            await database('saved_queries')
                .innerJoin(
                    'spaces',
                    'spaces.space_id',
                    'saved_queries.space_id',
                )
                .innerJoin(
                    'projects',
                    'projects.project_id',
                    'spaces.project_id',
                )
                .where('projects.project_uuid', first.projectUuid)
                .count<{ count: string }[]>('* as count')
                .first(),
        ).not.toEqual({ count: '0' });
        // The copy carries the sample document the Documents walkthroughs
        // open, with its charts: a seed that failed would only be logged.
        const [sample] = await database('documents')
            .where('project_uuid', first.projectUuid)
            .select('document_id', 'name', 'slug');
        expect(sample).toMatchObject({
            name: 'Monthly orders review',
            slug: 'monthly-orders-review',
        });
        const [version] = await database('document_versions')
            .where('document_id', sample.document_id)
            .select('markdown', 'chart_data');
        expect(version.markdown).toContain('<document-chart');
        expect(
            Object.keys(version.chart_data as Record<string, unknown>),
        ).toHaveLength(2);

        // Starting again hands the learner's copy back, with another day
        // before it expires: what one walkthrough built is there for the
        // next.
        const second = await projectService.createTrainingPreview(
            learner,
            trainingProjectUuid,
        );
        expect(second.projectUuid).toBe(first.projectUuid);
        expect(second.reused).toBe(true);
        expect(second.expiresAt!.getTime()).toBeGreaterThan(
            Date.now() + 23 * 60 * 60 * 1000,
        );
        // Starting fresh removes the copy; the next start makes a new one.
        await projectService.deleteTrainingPreviews(
            learner,
            trainingProjectUuid,
        );
        expect(
            await database('projects')
                .where('project_uuid', first.projectUuid)
                .first(),
        ).toBeUndefined();
        const third = await projectService.createTrainingPreview(
            learner,
            trainingProjectUuid,
        );
        expect(third.projectUuid).not.toBe(first.projectUuid);
        expect(third.reused).toBe(false);
    });
});
