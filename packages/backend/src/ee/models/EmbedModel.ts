import { Embed, NotFoundError } from '@lightdash/common';
import { Knex } from 'knex';

type Dependencies = {
    database: Knex;
};
export class EmbedModel {
    private database: Knex;

    constructor(dependencies: Dependencies) {
        this.database = dependencies.database;
    }

    async get(projectUuid: string): Promise<Embed> {
        const [embed] = await this.database('embedding')
            .select()
            .leftJoin('users', 'embedding.created_by', 'users.user_uuid')
            .where('project_uuid', projectUuid);

        if (!embed) {
            throw new NotFoundError(
                `Embed not found for project ${projectUuid}`,
            );
        }

        // embed table does not cascade when the user gets deleted
        // so we need to check if the user still exists and throw an error if not
        // in the frontend this prompts the user to create a new embed
        if (!embed.user_uuid) {
            throw new NotFoundError(`User not found for embed`);
        }

        const dashboards = await this.database('dashboards')
            .select()
            .whereIn('dashboard_uuid', embed.dashboard_uuids);

        const validDashboardUuids = dashboards.map(
            (dashboard) => dashboard.dashboard_uuid,
        );

        return {
            projectUuid: embed.project_uuid,
            encodedSecret: embed.encoded_secret,
            dashboardUuids: validDashboardUuids,
            createdAt: embed.created_at,
            user: {
                userUuid: embed.user_uuid,
                firstName: embed.first_name,
                lastName: embed.last_name,
            },
        };
    }

    async save(
        projectUuid: string,
        encodedSecret: Buffer,
        dashboardUuids: string[],
        userUuid: string,
    ): Promise<void> {
        await this.database('embedding')
            .insert({
                project_uuid: projectUuid,
                encoded_secret: encodedSecret,
                dashboard_uuids: dashboardUuids,
                created_by: userUuid,
            })
            .onConflict('project_uuid')
            .merge();
    }

    async updateDashboards(
        projectUuid: string,
        dashboardUuids: string[],
    ): Promise<void> {
        await this.database('embedding')
            .update('dashboard_uuids', dashboardUuids)
            .where('project_uuid', projectUuid);
    }
}
