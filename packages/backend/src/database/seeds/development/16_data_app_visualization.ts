import { CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
    ChartType,
    DATA_APP_VIZ_TEMPLATE,
    generateSlug,
    SEED_DATA_APP_VIZ,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type DataAppVizSchema,
} from '@lightdash/common';
import { type Knex } from 'knex';
import { pack as tarPack } from 'tar-stream';
import { createS3ClientFromConfig } from '../../../clients/Aws/S3BaseClient';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { versionPrefix } from '../../../ee/services/AppGenerateService/appCode';
import { AppModel } from '../../../models/AppModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

const buildSourceTar = (): Promise<Buffer> =>
    new Promise((resolve, reject) => {
        const p = tarPack();
        const chunks: Buffer[] = [];
        p.on('data', (chunk: Buffer) => chunks.push(chunk));
        p.on('end', () => resolve(Buffer.concat(chunks)));
        p.on('error', reject);
        p.entry(
            { name: 'src/App.tsx' },
            'export default function App() { return null; }\n',
        );
        p.finalize();
    });

/**
 * Stores the version's source archive so this seeded app matches production
 * invariants: a 'ready' version always has its source in object storage.
 * Without it, the CLI download of content referencing this custom chart
 * type fails with "Source not found".
 */
const uploadSourceTar = async (): Promise<void> => {
    const s3Config = lightdashConfig.appRuntime.s3; // pragma: allowlist secret (product-name false positive)
    if (!s3Config) {
        console.warn(
            'Skipping seed data app source upload: app runtime S3 is not configured',
        );
        return;
    }
    const client = createS3ClientFromConfig(s3Config);
    const sourceTar = await buildSourceTar();
    const putSourceTar = () =>
        client.send(
            new PutObjectCommand({
                Bucket: s3Config.bucket,
                Key: `${versionPrefix(
                    SEED_DATA_APP_VIZ.appUuid,
                    SEED_DATA_APP_VIZ.version,
                )}source.tar`,
                Body: sourceTar,
                ContentType: 'application/x-tar',
            }),
        );
    try {
        await putSourceTar();
    } catch (error) {
        // Local MinIO may not have the apps bucket yet
        if (error instanceof Error && error.name === 'NoSuchBucket') {
            await client.send(
                new CreateBucketCommand({ Bucket: s3Config.bucket }),
            );
            await putSourceTar();
            return;
        }
        throw error;
    }
};

const vizSchema: DataAppVizSchema = {
    fields: [
        {
            name: 'status',
            label: 'Status',
            type: 'dimension',
            required: true,
        },
    ],
    configOptions: [],
    colorPalette: null,
};

export async function seed(knex: Knex): Promise<void> {
    const [seedSpace] = await new SpaceModel({ database: knex }).find({
        projectUuid: SEED_PROJECT.project_uuid,
        slug: 'jaffle-shop',
    });
    if (!seedSpace) throw new Error('No space found for seeding');

    await new AppModel({ database: knex }).createWithVersion(
        {
            app_id: SEED_DATA_APP_VIZ.appUuid,
            project_uuid: SEED_PROJECT.project_uuid,
            created_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
            name: SEED_DATA_APP_VIZ.name,
            description: 'Minimal data app visualization for API tests',
            slug: generateSlug(SEED_DATA_APP_VIZ.name),
            space_uuid: seedSpace.uuid,
            template: DATA_APP_VIZ_TEMPLATE,
        },
        { version: SEED_DATA_APP_VIZ.version, prompt: '' },
        'ready',
        undefined,
        undefined,
        vizSchema,
        { forceSlug: true },
    );

    await uploadSourceTar();

    await new SavedChartModel({
        database: knex,
        lightdashConfig,
    }).create(SEED_PROJECT.project_uuid, SEED_ORG_1_ADMIN.user_uuid, {
        spaceUuid: seedSpace.uuid,
        slug: generateSlug(SEED_DATA_APP_VIZ.chartName),
        name: SEED_DATA_APP_VIZ.chartName,
        description: 'Saved chart backed by the seeded data app visualization',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: ['orders_status'],
            metrics: ['orders_average_order_size'],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.DATA_APP_VIZ,
            config: {
                dataAppVizUuid: SEED_DATA_APP_VIZ.appUuid,
                fieldMapping: { status: 'orders_status' },
            },
        },
        tableConfig: {
            columnOrder: ['orders_status', 'orders_average_order_size'],
        },
        updatedByUser: {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
            firstName: SEED_ORG_1_ADMIN.first_name,
            lastName: SEED_ORG_1_ADMIN.last_name,
        },
    });
}
