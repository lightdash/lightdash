import {
    SEED_EMBED_SECRET,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { lightdashConfig } from '../../../../config/lightdashConfig';
import { DashboardsTableName } from '../../../../database/entities/dashboards';
import { ProjectTableName } from '../../../../database/entities/projects';
import { SpaceTableName } from '../../../../database/entities/spaces';
import { EncryptionUtil } from '../../../../utils/EncryptionUtil/EncryptionUtil';

export async function seed(knex: Knex): Promise<void> {
    const dashboard = await knex('dashboards')
        .leftJoin(
            SpaceTableName,
            `${DashboardsTableName}.space_id`,
            `${SpaceTableName}.space_id`,
        )
        .innerJoin(
            ProjectTableName,
            `${SpaceTableName}.project_id`,
            `${ProjectTableName}.project_id`,
        )
        .select('dashboard_uuid')
        .where(`${ProjectTableName}.project_uuid`, SEED_PROJECT.project_uuid)
        .first();

    if (dashboard === undefined) {
        throw new Error('Could not find dashboard to embed');
    }

    const encryptionUtil = new EncryptionUtil({ lightdashConfig });

    await knex('embedding').del();
    await knex('embedding').insert({
        project_uuid: SEED_PROJECT.project_uuid,
        encoded_secret: encryptionUtil.encrypt(SEED_EMBED_SECRET),
        dashboard_uuids: [dashboard.dashboard_uuid],
        created_by: SEED_ORG_1_ADMIN.user_uuid,
    });
}
