/**
 * PoC ONLY (CS-207): create a TRAINING project for one organization from the
 * playground bundle, so the trainee permission layer and scope walkthroughs
 * can be exercised on a dev instance. The real provisioner (flag, trigger,
 * training bundle, seed versioning) is Slice 3 of the spec; this script is
 * throwaway and must not ship.
 *
 * Usage (from packages/backend, with the instance's env loaded):
 *   pnpm dotenv -e ../../.env.development.local -- tsx src/scripts/provision-training-project.ts --email demo@lightdash.com
 */
import {
    DbtProjectType,
    DefaultSupportedDbtVersion,
    DuckdbConnectionType,
    ProjectType,
    RequestMethod,
    WarehouseTypes,
    type Explore,
    type ExploreError,
} from '@lightdash/common';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import App from '../App';
import { getEnterpriseAppArguments } from '../ee';
import { lightdashConfig } from '../config/lightdashConfig';
import { type AiAgentModel } from '../ee/models/AiAgentModel';
import { type AiDeepResearchRunModel } from '../ee/models/AiDeepResearchRunModel';
import { type PlaygroundContent } from '../ee/services/ProjectService/playgroundContentTypes';
import { createPlaygroundAppFileStore } from '../ee/services/ProjectService/playgroundAppFiles';
import { seedPlaygroundContent } from '../ee/services/ProjectService/seedPlaygroundContent';
import knexConfig from '../knexfile';

const emailArg = process.argv.indexOf('--email');
const email = emailArg === -1 ? undefined : process.argv[emailArg + 1];
if (!email) {
    throw new Error('Pass --email <org admin email>');
}

const bundleDir = path.resolve(
    process.env.PLAYGROUND_DATA_DIR ??
        path.join(__dirname, '../../assets/playground'),
);

const main = async () => {
    const app = new App({
        lightdashConfig,
        port: 0,
        environment: 'development',
        knexConfig,
        // The training seed needs the enterprise models (agents, research).
        ...(await getEnterpriseAppArguments()),
    });
    const models = app.getModels();
    const services = app.getServiceRepository();
    const db = models.getUserModel();

    const lightdashUser = await db.findUserByEmail(email);
    if (!lightdashUser) throw new Error(`No user with email ${email}`);
    const user = await db.findSessionUserByUUID(lightdashUser.userUuid);

    const explores = JSON.parse(
        readFileSync(path.join(bundleDir, 'explores.json'), 'utf8'),
    ) as (Explore | ExploreError)[];
    const content = JSON.parse(
        readFileSync(path.join(bundleDir, 'content.json'), 'utf8'),
    ) as PlaygroundContent;

    const projectService = services.getProjectService();
    const creation = await projectService.createWithoutCompile(
        user,
        {
            name: 'Training (sample data)',
            type: ProjectType.TRAINING,
            dbtConnection: { type: DbtProjectType.NONE },
            dbtVersion: DefaultSupportedDbtVersion,
            warehouseConnection: {
                type: WarehouseTypes.DUCKDB,
                connectionType: DuckdbConnectionType.EMBEDDED,
                dataset: 'jaffle_shop',
            },
        },
        RequestMethod.BACKEND,
        { source: 'training' },
    );
    const { projectUuid } = creation.project;
    console.log(`Created training project ${projectUuid}`);

    await models
        .getProjectModel()
        .saveExploresToCache(projectUuid, explores, true);
    console.log(`Cached ${explores.length} explores`);

    await seedPlaygroundContent({
        projectUuid,
        user,
        content: { ...content, space: { name: 'Training', path: 'training' } },
        spaceModel: models.getSpaceModel(),
        savedChartModel: models.getSavedChartModel(),
        dashboardModel: models.getDashboardModel(),
        pinnedListModel: models.getPinnedListModel(),
        commentModel: models.getCommentModel(),
        tagsModel: models.getTagsModel(),
        appModel: models.getAppModel(),
        aiAgentModel: models.getAiAgentModel<AiAgentModel>(),
        aiDeepResearchRunModel:
            models.getAiDeepResearchRunModel<AiDeepResearchRunModel>(),
        appFileStore: createPlaygroundAppFileStore(
            lightdashConfig.appRuntime.s3,
        ),
    });
    // Categories reach the metrics catalog through the index.
    await services.getCatalogService().indexCatalog(projectUuid, user.userUuid);
    // The playground seeder creates a private root space; training content
    // must be visible to every role (spec: public space). Slice 3 makes this
    // a seeder argument; the PoC flips the row.
    const knex = (
        models.getSpaceModel() as unknown as { database: import('knex').Knex }
    ).database;
    await knex('spaces')
        .whereIn(
            'project_id',
            knex('projects')
                .select('project_id')
                .where('project_uuid', projectUuid),
        )
        .update({ inherit_parent_permissions: true });
    console.log('Seeded content into a public Training space');
    console.log(
        `Open: ${lightdashConfig.siteUrl}/projects/${projectUuid}/home`,
    );
    process.exit(0);
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
